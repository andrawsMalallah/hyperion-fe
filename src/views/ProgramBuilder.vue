<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useExerciseStore } from '../stores/exercise'
import { useProgramStore } from '../stores/program'
import { useToastStore } from '../stores/toast'
import ExerciseSelectionModal from '../components/ExerciseSelectionModal.vue'
import ExerciseSpecCard from '../components/ExerciseSpecCard.vue'
import AppModal from '../components/AppModal.vue'
import PrimaryButton from '../components/PrimaryButton.vue'
import {
  isGroupType,
  typeOf,
  groupKeyOf,
  groupMembers,
  nextGroupKey,
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
// New programs start PRIVATE (user's call, Session 26) — publishing to
// Discover is a deliberate toggle, never a default someone ships unnoticed.
const draftIsPublic = ref(false)
const isDirty = ref(false)
const isSaving = ref(false)
const isDeleting = ref(false)

const initializeDraft = () => {
  if (targetProgram.value) {
    draftProgramName.value = targetProgram.value.name
    draftIsPublic.value = targetProgram.value.is_public ?? false
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
    : 'Are you sure you want to delete this entire program? This action cannot be undone. Workouts you already logged with it stay in your History.'
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
                <ExerciseSpecCard
                  v-for="(element, index) in day.exerciseObjects"
                  :key="element.id"
                  :day="day"
                  :element="element"
                  :index="index"
                  :expanded="expandedRx.has(rxKey(day.id, element.id))"
                  @move-up="moveUp(day, index)"
                  @move-down="moveDown(day, index)"
                  @remove="removeExercise(day, element)"
                  @toggle-rx="toggleRx(day, element.id)"
                  @set-type="type => setExerciseType(day, element.id, type)"
                  @toggle-group-member="otherId => toggleGroupMember(day, element.id, otherId)"
                  @dirty="isDirty = true"
                />

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
  /* Snappy reorder: tall day cards sliding for ~0.4s read as heavy/sluggish, so
     keep the slide but make it quick and crisp (short duration, ease-out with no
     overshoot) — the card snaps into place instead of gliding. */
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
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

</style>
