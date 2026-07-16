<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useExerciseStore } from '../stores/exercise'
import { useProgramStore } from '../stores/program'
import { useToastStore } from '../stores/toast'
import ExerciseSelectionModal from '../components/ExerciseSelectionModal.vue'
import AppModal from '../components/AppModal.vue'
import PrimaryButton from '../components/PrimaryButton.vue'
import { muscleGroupColor } from '../utils/muscleColors'
import {
  TYPE_OPTIONS,
  GROUP_SIZES,
  SUPERSET,
  isGroupType,
  isTagType,
  typeLabel,
  typeOf,
  groupKeyOf,
  groupMembers,
  nextGroupKey,
  groupLetter,
  validateDayGroups
} from '../utils/grouping'

const router = useRouter()
const route = useRoute()
const exerciseStore = useExerciseStore()
const programStore = useProgramStore()
const toast = useToastStore()

const pageLoading = ref(true)

const targetProgram = computed(() => {
  if (route.params.programId === 'new') {
    return programStore.draftProgram
  }
  if (route.params.programId) {
    return programStore.user_programs.find(s => String(s.id) === String(route.params.programId))
  }
  return programStore.user_programs.find(s => s.is_active)
})

// Local Draft State
const draftDays = ref([])
const draftProgramName = ref('')
const draftIsPublic = ref(true)
const isDirty = ref(false)
const isSaving = ref(false)
const isDeleting = ref(false)

const initializeDraft = () => {
  if (targetProgram.value) {
    draftProgramName.value = targetProgram.value.name
    draftIsPublic.value = targetProgram.value.is_public ?? true
    if (route.params.programId === 'new') {
      draftDays.value = JSON.parse(JSON.stringify(targetProgram.value.days || []))
    } else {
      draftDays.value = JSON.parse(JSON.stringify(
        programStore.program_days.filter(d => String(d.program_id) === String(targetProgram.value.id))
      ))
    }
  }
}

onMounted(async () => {
  pageLoading.value = true
  if (route.params.programId && route.params.programId !== 'new') {
    await programStore.fetchSingleProgram(route.params.programId)
  }
  initializeDraft()
  pageLoading.value = false
})

// Route Guard Logic
const showLeaveModal = ref(false)
let leavePromiseResolve = null

onBeforeRouteLeave((to, from) => {
  if (isDirty.value) {
    showLeaveModal.value = true
    return new Promise((resolve) => {
      leavePromiseResolve = resolve
    })
  }
})

const handleLeaveConfirm = () => {
  isDirty.value = false
  if (leavePromiseResolve) leavePromiseResolve(true)
}

const handleLeaveCancel = () => {
  if (leavePromiseResolve) leavePromiseResolve(false)
}

// Reactive local days based on draft
const localDays = computed(() => {
  return draftDays.value
    .sort((a, b) => a.display_order - b.display_order)
    .map(d => ({
      ...d,
      exerciseObjects: d.exercises.map(exId => exerciseStore.exercises.find(e => e.id === exId)).filter(e => e)
    }))
})

// Rename a day. `day` comes from the localDays computed (a shallow copy), so we
// must write day_name back onto the real draft entry, not the copy.
const updateDayName = (day, name) => {
  const d = draftDays.value.find(draft => draft.id === day.id)
  if (d) {
    d.day_name = name
    isDirty.value = true
  }
}

// Reorder whole days. display_order is what syncProgramDays/saveNewProgram
// persist (both derive it from array position), so swap in the display-order
// sequence, renumber, and reassign draftDays so array order == display order.
const moveDayUp = (day) => {
  const ordered = [...draftDays.value].sort((a, b) => a.display_order - b.display_order)
  const i = ordered.findIndex(d => d.id === day.id)
  if (i <= 0) return
  const tmp = ordered[i - 1]
  ordered[i - 1] = ordered[i]
  ordered[i] = tmp
  ordered.forEach((d, idx) => { d.display_order = idx + 1 })
  draftDays.value = ordered
  isDirty.value = true
}

const moveDayDown = (day) => {
  const ordered = [...draftDays.value].sort((a, b) => a.display_order - b.display_order)
  const i = ordered.findIndex(d => d.id === day.id)
  if (i === -1 || i >= ordered.length - 1) return
  const tmp = ordered[i + 1]
  ordered[i + 1] = ordered[i]
  ordered[i] = tmp
  ordered.forEach((d, idx) => { d.display_order = idx + 1 })
  draftDays.value = ordered
  isDirty.value = true
}

// Up/Down reordering
const moveUp = (day, index) => {
  if (index > 0) {
    const d = draftDays.value.find(draft => draft.id === day.id)
    if (d) {
      const item = d.exercises.splice(index, 1)[0]
      d.exercises.splice(index - 1, 0, item)
      isDirty.value = true
    }
  }
}

const moveDown = (day, index) => {
  if (index < day.exercises.length - 1) {
    const d = draftDays.value.find(draft => draft.id === day.id)
    if (d) {
      const item = d.exercises.splice(index, 1)[0]
      d.exercises.splice(index + 1, 0, item)
      isDirty.value = true
    }
  }
}

const removeExercise = (day, element) => {
  const d = draftDays.value.find(draft => draft.id === day.id)
  if (d) {
    d.exercises = d.exercises.filter(id => id !== element.id)
    isDirty.value = true
  }
}

// Exercise Modal state
const showExerciseModal = ref(false)
const selectedDayForModal = ref(null)

const openModal = (dayId) => {
  selectedDayForModal.value = dayId
  showExerciseModal.value = true
}

const handleAddExercises = (exerciseIds) => {
  const d = draftDays.value.find(draft => draft.id === selectedDayForModal.value)
  if (d && exerciseIds.length > 0) {
    d.exercises = [...d.exercises, ...exerciseIds]
    isDirty.value = true
  }
}

// Prescription (target sets / reps / rest) editing per exercise
const expandedRx = ref(new Set())

const rxKey = (dayId, exId) => `${dayId}:${exId}`

function toggleRx(day, exId) {
  const d = draftDays.value.find(draft => draft.id === day.id)
  if (!d) return
  if (!d.prescriptions) d.prescriptions = {}
  if (!d.prescriptions[exId]) d.prescriptions[exId] = {}
  const key = rxKey(day.id, exId)
  const next = new Set(expandedRx.value)
  next.has(key) ? next.delete(key) : next.add(key)
  expandedRx.value = next
}

function rxSummary(day, exId) {
  const rx = day.prescriptions?.[exId]
  if (!rx) return ''
  const parts = []
  if (rx.target_sets) {
    let reps = ''
    if (rx.rep_range_min && rx.rep_range_max) reps = `×${rx.rep_range_min}-${rx.rep_range_max}`
    else if (rx.rep_range_min) reps = `×${rx.rep_range_min}+`
    parts.push(`${rx.target_sets}${reps}`)
  } else if (rx.rep_range_min && rx.rep_range_max) {
    parts.push(`${rx.rep_range_min}-${rx.rep_range_max} reps`)
  }
  if (rx.target_rpe) parts.push(`@${rx.target_rpe}`)
  if (rx.rest_seconds) parts.push(`${rx.rest_seconds}s rest`)
  return parts.join(' · ')
}

// Structured version of the prescription, one value per target chip.
function rxChips(day, exId) {
  const rx = day.prescriptions?.[exId] || {}
  let reps = ''
  if (rx.rep_range_min && rx.rep_range_max) reps = `${rx.rep_range_min}–${rx.rep_range_max}`
  else if (rx.rep_range_min) reps = `${rx.rep_range_min}+`
  let setsReps = ''
  if (rx.target_sets && reps) setsReps = `${rx.target_sets} × ${reps}`
  else if (rx.target_sets) setsReps = `${rx.target_sets} sets`
  else if (reps) setsReps = `${reps} reps`
  return {
    setsReps,
    rpe: rx.target_rpe || '',
    rest: rx.rest_seconds ? `${rx.rest_seconds}s` : ''
  }
}

// Exercise type (drop set / pyramid set / superset / giant set) ----------------
// The type lives on the prescription. localDays entries share their
// `prescriptions` object with the draft by reference, so reads can use either —
// writes go through the draft so a brand-new prescription lands on real state.

function draftDay(day) {
  return draftDays.value.find(draft => draft.id === day.id)
}

function ensureRx(d, exId) {
  if (!d.prescriptions) d.prescriptions = {}
  if (!d.prescriptions[exId]) d.prescriptions[exId] = {}
  return d.prescriptions[exId]
}

function clearType(d, exId) {
  const rx = d.prescriptions?.[exId]
  if (!rx) return
  delete rx.group_type
  delete rx.group_key
}

function setExerciseType(day, exId, type) {
  const d = draftDay(day)
  if (!d) return

  const previousType = typeOf(d, exId)
  const previousKey = groupKeyOf(d, exId)
  if (type === previousType) return

  // Superset -> giant set (or back) keeps the group together and just retypes
  // every member, rather than making the user rebuild it.
  if (isGroupType(previousType) && isGroupType(type)) {
    groupMembers(d, previousKey).forEach(id => { ensureRx(d, id).group_type = type })
    isDirty.value = true
    return
  }

  // Leaving a grouping type dissolves the group: the other members would
  // otherwise be left in a group too small to save.
  if (isGroupType(previousType)) {
    groupMembers(d, previousKey).forEach(id => clearType(d, id))
  }

  if (!type) {
    clearType(d, exId)
    isDirty.value = true
    return
  }

  const rx = ensureRx(d, exId)
  rx.group_type = type
  if (isGroupType(type)) rx.group_key = nextGroupKey(d)
  else delete rx.group_key
  isDirty.value = true
}

// The group is edited on its first member, so the checkbox list appears once
// rather than on every card in the group.
function isGroupAnchor(day, exId) {
  const key = groupKeyOf(day, exId)
  if (key === null || !isGroupType(typeOf(day, exId))) return false
  return groupMembers(day, key)[0] === exId
}

function otherExercises(day, exId) {
  return day.exerciseObjects.filter(e => e.id !== exId)
}

function isInGroupWith(day, anchorId, otherId) {
  const key = groupKeyOf(day, anchorId)
  return key !== null && groupKeyOf(day, otherId) === key
}

function toggleGroupMember(day, anchorId, otherId) {
  const d = draftDay(day)
  if (!d) return
  const key = groupKeyOf(d, anchorId)
  const type = typeOf(d, anchorId)
  if (key === null || !isGroupType(type)) return

  if (groupKeyOf(d, otherId) === key) {
    clearType(d, otherId)
  } else {
    const rx = ensureRx(d, otherId)
    rx.group_type = type
    rx.group_key = key
  }
  isDirty.value = true
}

// Live feedback under the checkbox list, so a group that's the wrong size is
// obvious while building it instead of on save.
function groupStatus(day, exId) {
  const type = typeOf(day, exId)
  const count = groupMembers(day, groupKeyOf(day, exId)).length
  const { min, max } = GROUP_SIZES[type] || {}
  if (!min) return null

  if (count < min) {
    const needed = min - count
    return {
      ok: false,
      text: type === SUPERSET
        ? 'Pick 1 more exercise — a superset joins exactly 2.'
        : `Pick ${needed} more — a giant set joins at least 3.`
    }
  }
  if (max !== null && max !== undefined && count > max) {
    return { ok: false, text: 'A superset joins exactly 2. Use a giant set for 3 or more.' }
  }
  return { ok: true, text: `${count} exercises joined — rest starts after the last one.` }
}

// Whether the targets strip has anything to show — a bare type counts, so a
// drop set with no numbers still reads as configured rather than empty.
function hasAnyRx(day, exId) {
  return !!(rxSummary(day, exId) || typeOf(day, exId))
}

function groupBadge(day, exId) {
  const type = typeOf(day, exId)
  if (!isGroupType(type)) return ''
  return `${typeLabel(type)} ${groupLetter(day, groupKeyOf(day, exId))}`.trim()
}

function anchorNameFor(day, exId) {
  const anchorId = groupMembers(day, groupKeyOf(day, exId))[0]
  return day.exerciseObjects.find(e => e.id === anchorId)?.name || 'the first exercise'
}

// Dialog States
const showAddDayModal = ref(false)
const showDeleteDayModal = ref(false)
const showDeleteProgramModal = ref(false)
const dayToDelete = ref(null)

const defaultAddDayName = computed(() => "Day " + (draftDays.value.length + 1))

const promptAddDay = () => showAddDayModal.value = true

const deleteProgramModalTitle = computed(() => {
  return route.params.programId === 'new' ? 'Discard Draft' : 'Delete Program'
})

const deleteProgramModalMessage = computed(() => {
  return route.params.programId === 'new'
    ? 'Are you sure you want to discard this program draft? This action cannot be undone.'
    : 'Are you sure you want to delete this entire program? This action cannot be undone.'
})

const deleteProgramConfirmText = computed(() => {
  return route.params.programId === 'new' ? 'Discard Draft' : 'Delete Program'
})

const handleAddDayConfirm = (name) => {
  if (name) {
    const newOrder = draftDays.value.length > 0 ? Math.max(...draftDays.value.map(d => d.display_order)) + 1 : 1
    draftDays.value.push({
      id: 'day-draft-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      program_id: targetProgram.value.id,
      day_name: name,
      display_order: newOrder,
      exercises: []
    })
    isDirty.value = true
  }
}

const deleteDay = (dayId) => {
  dayToDelete.value = dayId
  showDeleteDayModal.value = true
}

const handleDeleteDayConfirm = () => {
  if (dayToDelete.value) {
    draftDays.value = draftDays.value.filter(d => d.id !== dayToDelete.value)
    isDirty.value = true
    dayToDelete.value = null
  }
}

const saveProgram = async () => {
  if (targetProgram.value) {
    // Group sizes are enforced server-side too; checking here turns a 422 into
    // a message that names the day at fault.
    for (const d of draftDays.value) {
      const groupError = validateDayGroups(d)
      if (groupError) {
        toast.error(`${d.day_name}: ${groupError}`)
        return
      }
    }

    isSaving.value = true
    try {
      if (route.params.programId === 'new') {
        const newId = await programStore.saveNewProgram({
          name: draftProgramName.value.trim() || 'Custom Program',
          is_public: draftIsPublic.value,
          days: draftDays.value
        })
        if (newId) {
          router.replace(`/builder/${newId}`)
        }
      } else {
        if (draftProgramName.value && draftProgramName.value.trim() !== '' && draftProgramName.value !== targetProgram.value.name) {
          programStore.renameProgram(targetProgram.value.id, draftProgramName.value.trim())
        }
        targetProgram.value.is_public = draftIsPublic.value
        await programStore.syncProgramDays(targetProgram.value.id, draftDays.value)
      }
      isDirty.value = false
      toast.success('Program saved')
    } catch {
      // Validation / server errors are surfaced as toasts by the interceptor.
    } finally {
      isSaving.value = false
    }
  }
}

const deleteProgram = () => {
  showDeleteProgramModal.value = true
}

const handleDeleteProgramConfirm = async () => {
  isDirty.value = false // Prevent leave guard
  isDeleting.value = true
  try {
    if (route.params.programId === 'new') {
      programStore.draftProgram = null
    } else {
      await programStore.deleteProgram(targetProgram.value.id)
    }
    router.push('/')
  } catch (error) {
    isDeleting.value = false
    console.error('Failed to delete program:', error)
  }
}

const getMuscleGroupColor = muscleGroupColor
</script>

<template>
  <div class="program-builder">
    <Transition name="page-fade" mode="out-in">
      <!-- Loading Skeleton State -->
      <div v-if="pageLoading" class="builder-skeleton" key="skeleton">
        <div class="skeleton-header skeleton-pulse"></div>
        <div class="skeleton-days">
          <div v-for="n in 2" :key="n" class="skeleton-day-card card skeleton-pulse">
            <div class="skeleton-day-header">
              <div class="skeleton-bar title-bar"></div>
              <div class="skeleton-circle-btn"></div>
            </div>
            <div class="skeleton-exercise-list">
              <div v-for="ex in 2" :key="ex" class="skeleton-exercise-item">
                <div class="skeleton-bar text-bar"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="builder-content-wrapper" v-else-if="targetProgram" key="content">
        <div class="header-row">
          <input class="program-name-input" v-model="draftProgramName" @input="isDirty = true"
            placeholder="Program Name" aria-label="Program name" />
        </div>

        <div class="builder-container">
          <!-- Program Days Area. Own transition name ("day") so reordering whole
               days is decoupled from the inner exercise list's list-fade. -->
          <TransitionGroup name="day" tag="div" class="days-panel">
            <div v-for="(day, dayIndex) in localDays" :key="day.id" class="card day-card">
              <div class="day-header">
                <!-- Wrapper mirrors the value in a hidden ::after (see .day-name-field
                     in style.css) so the input auto-sizes to its text, not the row. -->
                <label class="day-name-field" :data-value="day.day_name || 'Day name'">
                  <input class="day-name-input" :value="day.day_name"
                    @input="updateDayName(day, $event.target.value)"
                    @keydown.enter.prevent="$event.target.blur()" maxlength="255"
                    placeholder="Day name" aria-label="Day name" />
                </label>
                <div class="day-actions gap-8">
                  <button class="btn-secondary day-action-btn" :disabled="dayIndex === 0"
                    @click="moveDayUp(day)" title="Move Day Up" aria-label="Move day up">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"
                      stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="18 15 12 9 6 15"></polyline>
                    </svg>
                  </button>
                  <button class="btn-secondary day-action-btn" :disabled="dayIndex === localDays.length - 1"
                    @click="moveDayDown(day)" title="Move Day Down" aria-label="Move day down">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"
                      stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                  <button class="btn-secondary day-action-btn" @click="openModal(day.id)" title="Add Exercise">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                  </button>
                  <button class="btn-secondary day-action-btn delete-day-btn" @click="deleteDay(day.id)"
                    title="Delete Day">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"
                      stroke-linecap="round" stroke-linejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              </div>

              <TransitionGroup name="list-fade" tag="div" class="day-list">
                <div v-for="(element, index) in day.exerciseObjects" :key="element.id"
                  class="ex-card"
                  :class="{ 'ex-card--editing': expandedRx.has(rxKey(day.id, element.id)) }"
                  :style="{ '--muscle': getMuscleGroupColor(element.target_muscle_group) }">

                  <!-- Header: index · name + muscle · reorder + actions -->
                  <div class="ex-card-head">
                    <span class="ex-index">{{ index + 1 }}</span>

                    <div class="ex-title">
                      <span class="ex-card-name">{{ element.name }}</span>
                      <span class="ex-muscle" v-if="element.target_muscle_group">
                        {{ element.target_muscle_group }}
                      </span>
                    </div>

                    <span class="ex-group-badge" v-if="groupBadge(day, element.id)">
                      {{ groupBadge(day, element.id) }}
                    </span>

                    <div class="ex-reorder">
                      <button class="ex-move" :disabled="index === 0" @click="moveUp(day, index)" title="Move Up"
                        aria-label="Move up">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
                          stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="18 15 12 9 6 15"></polyline>
                        </svg>
                      </button>
                      <button class="ex-move" :disabled="index === day.exerciseObjects.length - 1"
                        @click="moveDown(day, index)" title="Move Down" aria-label="Move down">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
                          stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </button>
                    </div>

                    <button class="ex-remove" @click="removeExercise(day, element)" title="Remove Exercise"
                      aria-label="Remove exercise">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
                        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>

                  <!-- Targets strip: chips when set, or an "add targets" prompt -->
                  <div class="ex-targets">
                    <template v-if="hasAnyRx(day, element.id)">
                      <!-- Grouping types are already named by the header badge,
                           so only the tag types need a chip here. -->
                      <span class="target-chip" v-if="isTagType(typeOf(day, element.id))">
                        <span class="chip-val">{{ typeLabel(typeOf(day, element.id)) }}</span>
                        <span class="chip-key">type</span>
                      </span>
                      <span class="target-chip" v-if="rxChips(day, element.id).setsReps">
                        <span class="chip-val">{{ rxChips(day, element.id).setsReps }}</span>
                        <span class="chip-key">sets × reps</span>
                      </span>
                      <span class="target-chip" v-if="rxChips(day, element.id).rpe">
                        <span class="chip-val">@{{ rxChips(day, element.id).rpe }}</span>
                        <span class="chip-key">RPE</span>
                      </span>
                      <span class="target-chip" v-if="rxChips(day, element.id).rest">
                        <span class="chip-val">{{ rxChips(day, element.id).rest }}</span>
                        <span class="chip-key">rest</span>
                      </span>
                      <button class="target-edit" @click="toggleRx(day, element.id)"
                        :class="{ 'target-edit--active': expandedRx.has(rxKey(day.id, element.id)) }"
                        :aria-expanded="expandedRx.has(rxKey(day.id, element.id))">
                        {{ expandedRx.has(rxKey(day.id, element.id)) ? 'Done' : 'Edit targets' }}
                      </button>
                    </template>
                    <button v-else class="target-add" @click="toggleRx(day, element.id)"
                      :aria-expanded="expandedRx.has(rxKey(day.id, element.id))">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                        stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                      Set targets
                    </button>
                  </div>

                  <!-- Editor — always mounted; height animates via grid-rows
                       so it opens AND closes smoothly with no re-render pop. -->
                  <div class="rx-collapse"
                    :class="{ 'rx-collapse--open': expandedRx.has(rxKey(day.id, element.id)) }">
                    <div class="rx-collapse-inner">
                      <div class="rx-editor" v-if="day.prescriptions?.[element.id]">
                        <label class="rx-field">
                          <span>Sets</span>
                          <input type="number" min="1" max="20"
                            v-model.number="day.prescriptions[element.id].target_sets" @input="isDirty = true"
                            placeholder="3" />
                        </label>
                        <label class="rx-field">
                          <span>Reps min</span>
                          <input type="number" min="1" max="100"
                            v-model.number="day.prescriptions[element.id].rep_range_min" @input="isDirty = true"
                            placeholder="8" />
                        </label>
                        <label class="rx-field">
                          <span>Reps max</span>
                          <input type="number" min="1" max="100"
                            v-model.number="day.prescriptions[element.id].rep_range_max" @input="isDirty = true"
                            placeholder="12" />
                        </label>
                        <label class="rx-field">
                          <span>RPE</span>
                          <input type="number" min="1" max="10"
                            v-model.number="day.prescriptions[element.id].target_rpe" @input="isDirty = true"
                            placeholder="–" />
                        </label>
                        <label class="rx-field">
                          <span>Rest (s)</span>
                          <input type="number" min="0" max="600" step="15"
                            v-model.number="day.prescriptions[element.id].rest_seconds" @input="isDirty = true"
                            placeholder="90" />
                        </label>
                        <!-- Full-width coaching note (spans the whole grid row); shown
                             read-only under the exercise on the Active Workout screen. -->
                        <label class="rx-field rx-field-notes">
                          <span>Notes</span>
                          <textarea rows="2" maxlength="500"
                            v-model="day.prescriptions[element.id].notes" @input="isDirty = true"
                            placeholder="Coaching cue — e.g. pause 1s at the bottom, elbows tucked"></textarea>
                        </label>

                        <!-- How the exercise is performed. Drop/pyramid are tags on
                             this exercise alone; superset/giant join it to others,
                             so picking one reveals the member list below. -->
                        <label class="rx-field rx-field-type">
                          <span>Type</span>
                          <select :value="typeOf(day, element.id) || ''"
                            @change="setExerciseType(day, element.id, $event.target.value || null)">
                            <option value="">None</option>
                            <option v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">
                              {{ opt.label }}
                            </option>
                          </select>
                        </label>

                        <div class="rx-group" v-if="isGroupType(typeOf(day, element.id))">
                          <!-- The group is edited on its first exercise only, so the
                               list appears once instead of on every member. -->
                          <template v-if="isGroupAnchor(day, element.id)">
                            <span class="rx-group-title">
                              Performed with — pick
                              {{ typeOf(day, element.id) === SUPERSET ? '1 other exercise' : '2 or more others' }}
                            </span>
                            <div class="rx-group-options" v-if="otherExercises(day, element.id).length">
                              <label v-for="other in otherExercises(day, element.id)" :key="other.id"
                                class="rx-group-option">
                                <input type="checkbox" :checked="isInGroupWith(day, element.id, other.id)"
                                  @change="toggleGroupMember(day, element.id, other.id)" />
                                <span>{{ other.name }}</span>
                              </label>
                            </div>
                            <p class="rx-group-hint" v-else>
                              Add another exercise to this day first.
                            </p>
                            <p class="rx-group-hint"
                              :class="{ 'rx-group-hint--warn': groupStatus(day, element.id) && !groupStatus(day, element.id).ok }"
                              v-if="groupStatus(day, element.id)">
                              {{ groupStatus(day, element.id).text }}
                            </p>
                          </template>
                          <p class="rx-group-hint" v-else>
                            Part of {{ groupBadge(day, element.id) }} — edit the group on
                            {{ anchorNameFor(day, element.id) }}.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-if="day.exerciseObjects.length === 0" key="empty" class="empty-state">
                  No exercises added. Click "+ Add Exercise" to start.
                </div>
              </TransitionGroup>
            </div>

          </TransitionGroup>

          <!-- Builder footer: visibility toggle lives in the action bar -->
          <div class="builder-footer">
            <div class="builder-actions">
              <button class="builder-visibility-btn" :class="{ 'builder-visibility-btn--public': draftIsPublic }"
                :aria-pressed="draftIsPublic" @click="draftIsPublic = !draftIsPublic; isDirty = true"
                :title="draftIsPublic ? 'Anyone can find this program in Discover' : 'Only you can see this program'">
                {{ draftIsPublic ? 'Public' : 'Private' }}
              </button>

              <button class="builder-add-day-btn" @click="promptAddDay">
                Add Day
              </button>

              <button class="builder-delete-btn" @click="deleteProgram" :disabled="isDeleting || isSaving"
                :title="route.params.programId === 'new' ? 'Discard Draft' : 'Delete Program'">
                <div v-if="isDeleting" class="spinner button-spinner"></div>
                {{ isDeleting ? (route.params.programId === 'new' ? 'Discarding...' : 'Deleting...') :
                  (route.params.programId === 'new' ? 'Discard' : 'Delete') }}
              </button>

              <button class="builder-save-btn" @click="saveProgram" :disabled="!isDirty || isSaving"
                :class="{ 'builder-save-btn--active': isDirty }">
                <div v-if="isSaving" class="spinner button-spinner"></div>
                {{ isSaving ? 'Saving...' : (isDirty ? 'Save' : 'Saved') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="!route.params.programId || route.params.programId === 'new'" class="empty-state" key="empty">
        <p>No active program or draft found. Please select or create one.</p>
        <div style="display: flex; gap: 12px; justify-content: center; margin-top: 16px;">
          <router-link to="/" class="btn-secondary tap-target inline-flex no-underline">Go to Home</router-link>
          <PrimaryButton to="/create" class="inline-flex no-underline">Create Program</PrimaryButton>
        </div>
      </div>
    </Transition>

    <!-- Modals -->
    <ExerciseSelectionModal v-model:show="showExerciseModal" :dayId="selectedDayForModal" @add="handleAddExercises" />

    <AppModal v-model:show="showLeaveModal" title="Unsaved Changes"
      message="You have unsaved changes. Are you sure you want to leave?" type="confirm" confirm-text="Leave"
      cancel-text="Stay" @confirm="handleLeaveConfirm" @cancel="handleLeaveCancel" />

    <AppModal v-model:show="showAddDayModal" title="Add New Day" message="Enter a name for the new day:" type="prompt"
      :default-value="defaultAddDayName" confirm-text="Add" @confirm="handleAddDayConfirm" />

    <AppModal v-model:show="showDeleteDayModal" title="Delete Day"
      message="Are you sure you want to delete this day? This action cannot be undone." type="confirm"
      confirm-text="Delete" @confirm="handleDeleteDayConfirm" />

    <AppModal v-model:show="showDeleteProgramModal" :title="deleteProgramModalTitle"
      :message="deleteProgramModalMessage" type="confirm" :confirm-text="deleteProgramConfirmText"
      @confirm="handleDeleteProgramConfirm" />

  </div>
</template>

<style scoped>
.builder-footer {
  display: flex;
  flex-direction: column;
}

/* ===== Day reorder / enter / leave =======================================
   The days TransitionGroup uses name="day" (its own, not the exercise
   list's list-fade). On reorder Vue adds .day-move and FLIPs the cards;
   this gives that a smooth, promoted transform transition. Enter/leave
   cover adding and deleting a day. */
.days-panel :deep(.day-move) {
  transition: transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;
}

.days-panel :deep(.day-enter-active),
.days-panel :deep(.day-leave-active) {
  transition: all 0.32s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.days-panel :deep(.day-enter-from) {
  opacity: 0;
  transform: translateY(16px);
}

.days-panel :deep(.day-leave-to) {
  opacity: 0;
  transform: translateY(-16px);
}

/* A leaving day must drop out of flow so the others FLIP into place
   instead of jumping when it's removed. */
.days-panel :deep(.day-leave-active) {
  position: absolute;
  width: 100%;
}

@media (prefers-reduced-motion: reduce) {
  .days-panel :deep(.day-move),
  .days-panel :deep(.day-enter-active),
  .days-panel :deep(.day-leave-active) {
    transition: none;
  }
}

/* ===== Exercise card =====================================================
   Each exercise is a self-contained card carrying a left rail tinted with its
   muscle-group color (--muscle, set inline). Three stacked zones: header,
   targets strip, and the expandable editor. Reflows cleanly from phone to
   desktop because everything is intrinsic width + wrap, no fixed columns. */
.ex-card {
  --muscle: var(--border-color);
  position: relative;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 60%),
    var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px 16px 14px 18px;
  margin-bottom: 10px;
  overflow: hidden;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

/* Reorder (FLIP): the TransitionGroup adds .list-fade-move and sets the
   transform; give these cards a matching, dedicated move transition and
   promote them to their own layer so the slide is one smooth motion instead
   of stepping. Overriding here keeps it from inheriting the generic timing. */
.day-list :deep(.list-fade-move) {
  transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;
}

/* A card leaving the list must not collapse the layout instantly, or the
   remaining cards jump before they animate. */
.day-list :deep(.list-fade-leave-active) {
  position: absolute;
  width: calc(100% - 16px);
}

/* Muscle-group rail */
.ex-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--muscle);
}

.ex-card:hover {
  border-color: #444;
}

.ex-card--editing {
  border-color: rgba(204, 255, 0, 0.35);
  box-shadow: 0 0 0 1px rgba(204, 255, 0, 0.08);
}

/* ---- Header row: index · title/muscle · reorder · remove ---- */
.ex-card-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ex-index {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.ex-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ex-card-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.25;
  overflow-wrap: break-word;
}

.ex-muscle {
  align-self: flex-start;
  max-width: 100%;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--muscle);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Names the group a card belongs to ("Superset A"), so members are readable at
   a glance without opening the editor. */
.ex-group-badge {
  flex-shrink: 0;
  padding: 4px 9px;
  border-radius: 6px;
  border: 1px solid rgba(204, 255, 0, 0.4);
  background: rgba(204, 255, 0, 0.08);
  color: var(--primary-accent);
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.ex-reorder {
  flex-shrink: 0;
  display: flex;
  gap: 4px;
}

.ex-move {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  border: 1px solid var(--border-color);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.ex-move:disabled {
  opacity: 0.2;
  cursor: not-allowed;
}

.ex-remove {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

@media (hover: hover) {
  .ex-move:not(:disabled):hover {
    color: var(--text-primary);
    border-color: #555;
    background: var(--bg-surface-hover);
  }
  .ex-remove:hover {
    color: var(--danger);
    border-color: rgba(255, 77, 77, 0.4);
    background: rgba(255, 77, 77, 0.08);
  }
}

/* ---- Targets strip ---- */
.ex-targets {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.target-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid var(--border-color);
}

.chip-val {
  font-size: 13px;
  font-weight: 800;
  color: var(--primary-accent);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.chip-key {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

/* Edit / add-targets pills */
.target-edit,
.target-add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
}

.target-edit {
  margin-left: auto;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  transition: color 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
}

.target-edit--active {
  border-color: var(--primary-accent);
  color: var(--primary-accent);
}

.target-add {
  border: 1px dashed rgba(204, 255, 0, 0.4);
  background: rgba(204, 255, 0, 0.03);
  color: var(--primary-accent);
}

@media (hover: hover) {
  .target-edit:hover {
    color: var(--text-primary);
    border-color: #555;
  }
  .target-add:hover {
    background: rgba(204, 255, 0, 0.08);
  }
}

/* ---- Editor: labeled numeric grid, 5→3→2 columns ---- */
/* Collapsible wrapper: grid-rows 0fr → 1fr animates height with no JS and no
   unmount, so open and close are both smooth and nothing re-renders mid-edit. */
.rx-collapse {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows 0.28s cubic-bezier(0.25, 0.8, 0.25, 1),
    opacity 0.2s ease;
}

.rx-collapse--open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.rx-collapse-inner {
  overflow: hidden;
  min-height: 0;
}

.rx-editor {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  margin-top: 12px;
  padding: 14px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

@media (max-width: 620px) {
  .rx-editor {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 380px) {
  .rx-editor {
    grid-template-columns: repeat(2, 1fr);
  }
}

.rx-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.rx-field span {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

.rx-field input {
  width: 100%;
  background-color: var(--bg-main);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 7px;
  padding: 9px 8px;
  font-size: 15px;
  font-weight: 700;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.rx-field input:focus {
  outline: none;
  border-color: var(--primary-accent);
}

/* Notes field spans the full editor grid (it's free text, not a numeric cell). */
.rx-field-notes {
  grid-column: 1 / -1;
}

/* Type picker + its group member list both span the editor grid. */
.rx-field-type,
.rx-group {
  grid-column: 1 / -1;
}

.rx-field select {
  width: 100%;
  background-color: var(--bg-main);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 7px;
  padding: 9px 8px;
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
}

.rx-field select:focus {
  outline: none;
  border-color: var(--primary-accent);
}

.rx-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px dashed rgba(204, 255, 0, 0.35);
  border-radius: 8px;
  background: rgba(204, 255, 0, 0.03);
}

.rx-group-title {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

.rx-group-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.rx-group-option {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-main);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
}

.rx-group-option input {
  accent-color: var(--primary-accent);
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.rx-group-option:has(input:checked) {
  border-color: var(--primary-accent);
  background: rgba(204, 255, 0, 0.08);
}

.rx-group-hint {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  line-height: 1.4;
}

.rx-group-hint--warn {
  color: var(--danger);
}

.rx-field textarea {
  width: 100%;
  background-color: var(--bg-main);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 7px;
  padding: 9px 8px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  line-height: 1.4;
  resize: vertical;
  min-height: 42px;
}

.rx-field textarea:focus {
  outline: none;
  border-color: var(--primary-accent);
}

@media (prefers-reduced-motion: reduce) {
  .rx-collapse {
    transition: none;
  }
}
</style>
