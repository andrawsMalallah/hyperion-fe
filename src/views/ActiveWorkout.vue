<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { useProgramStore } from '../stores/program'
import { useWorkoutStore } from '../stores/workout'
import { useExerciseStore } from '../stores/exercise'
import { useToastStore } from '../stores/toast'
import { useHistoryStore } from '../stores/history'
import { useSyncStore } from '../stores/sync'
import AppModal from '../components/AppModal.vue'
import PrimaryButton from '../components/PrimaryButton.vue'
import { toKg, formatWeight } from '../utils/units'
import {
  isGroupType,
  isTagType,
  typeLabel,
  typeOf,
  groupKeyOf,
  groupMembers,
  groupLetter,
  isLastOfGroup
} from '../utils/grouping'
import api from '../api'

const props = defineProps({
  dayId: String
})

const router = useRouter()
const programStore = useProgramStore()
const workoutStore = useWorkoutStore()
const exerciseStore = useExerciseStore()
const toast = useToastStore()
const historyStore = useHistoryStore()
const syncStore = useSyncStore()

// If dayId isn't found locally, it's fine, we try to match it.
// To handle the API type (it could be an integer ID now from the API)
const parsedDayId = isNaN(Number(props.dayId)) ? props.dayId : Number(props.dayId);
const day = computed(() => programStore.program_days.find(d => d.id === parsedDayId))

// This is local component state to manage the UI structure
const activeWorkoutSession = ref([])
const pageLoading = ref(true)
const isSaving = ref(false)

// Keep the screen awake mid-workout (phones lock fast in a gym).
let wakeLock = null

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen')
    }
  } catch (e) {
    // Not critical — browser may refuse (low battery, unsupported).
  }
}

function handleVisibility() {
  if (document.visibilityState === 'visible') {
    requestWakeLock()
  }
}

onMounted(async () => {
  pageLoading.value = true
  requestWakeLock()
  document.addEventListener('visibilitychange', handleVisibility)
  window.addEventListener('beforeunload', beforeUnloadGuard)

  // Load the day, then just the per-exercise summary it needs (last session +
  // best e1rm) — not the full workout history.
  await programStore.fetchSingleProgramByDay(parsedDayId)
  if (day.value) {
    await workoutStore.fetchRecentSets(day.value.exercises)
      .catch(e => console.error('Failed to load recent sets:', e))
  }

  if (workoutStore.activeWorkoutDayId !== parsedDayId) {
    workoutStore.startWorkout(parsedDayId)
  }

  if (day.value && activeWorkoutSession.value.length === 0) {
    activeWorkoutSession.value = day.value.exercises.map(exId => {
      const exercise = exerciseStore.exercises.find(e => e.id === exId)
      const prevSets = workoutStore.getPreviousSets(exId)
      const rx = day.value.prescriptions?.[exId] || null

      // Load existing sets logged during this active workout session
      // (weights are stored in kg; inputs display the user's unit).
      const existingSets = workoutStore.activeWorkoutSets
        .filter(s => s.exercise_id === exId)
        .map(s => ({
          localId: s.id,
          weight: formatWeight(s.weight, workoutStore.weightUnit),
          reps: s.reps,
          rpe: s.rpe ?? '',
          set_type: s.set_type || 'working',
          completed: true,
          setId: s.id
        }))

    // Prefill empty rows from the prescription so the athlete sees the
    // planned volume without tapping "Add Set" repeatedly.
      const sets = existingSets
      if (sets.length === 0 && rx?.target_sets) {
        for (let i = 0; i < rx.target_sets; i++) {
          sets.push({
            localId: Date.now() + Math.random(),
            weight: '',
            reps: '',
            rpe: '',
            set_type: 'working',
            completed: false,
            setId: null
          })
        }
      }

      return {
        id: exId,
        exercise,
        rx,
        prevSets,
        prevLoad: prevSets.length > 0 ? { weight: prevSets[0].weight, reps: prevSets[0].reps } : null,
        sets
      }
    })
  }
  pageLoading.value = false
})

function rxLabel(rx) {
  if (!rx) return ''
  const parts = []
  if (rx.target_sets) {
    let reps = ''
    if (rx.rep_range_min && rx.rep_range_max) reps = `×${rx.rep_range_min}-${rx.rep_range_max}`
    parts.push(`Target: ${rx.target_sets}${reps}`)
  }
  if (rx.target_rpe) parts.push(`@${rx.target_rpe}`)
  if (rx.rest_seconds) parts.push(`${rx.rest_seconds}s rest`)
  return parts.join(' · ')
}

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibility)
  window.removeEventListener('beforeunload', beforeUnloadGuard)
  if (wakeLock) {
    wakeLock.release().catch(() => {})
    wakeLock = null
  }
})

// Exercise type ---------------------------------------------------------------
// The type is prescribed on the day, so it's read straight off it rather than
// copied into the session rows.

/** "Drop Set" / "Pyramid Set" for the tag types, else '' — group types get a header. */
function exTypeTag(ex) {
  const type = typeOf(day.value, ex.id)
  return isTagType(type) ? typeLabel(type) : ''
}

function isGrouped(ex) {
  return isGroupType(typeOf(day.value, ex.id))
}

/**
 * The header shown above a group's first exercise, naming it and the exercises
 * it's performed with.
 */
function groupHeaderFor(ex) {
  const type = typeOf(day.value, ex.id)
  if (!isGroupType(type)) return null

  const key = groupKeyOf(day.value, ex.id)
  const members = groupMembers(day.value, key)
  if (members[0] !== ex.id) return null

  const names = members
    .map(id => exerciseStore.exercises.find(e => e.id === id)?.name)
    .filter(Boolean)

  return {
    label: `${typeLabel(type)} ${groupLetter(day.value, key)}`.trim(),
    hint: `${names.join(' → ')} — back to back, rest after the last one.`
  }
}

function formatPrevSets(prevSets) {
  if (!prevSets || prevSets.length === 0) return ''
  const shown = prevSets.slice(0, 4)
    .map(s => `${formatWeight(s.weight, workoutStore.weightUnit)}×${s.reps}`)
    .join(' · ')
  return prevSets.length > 4 ? shown + ' …' : shown
}

function addSet(exIndex) {
  activeWorkoutSession.value[exIndex].sets.push({
    localId: Date.now() + Math.random(),
    weight: '',
    reps: '',
    rpe: '',
    set_type: 'working',
    completed: false,
    setId: null
  })
}

function toggleWarmup(s) {
  if (s.completed) return
  s.set_type = s.set_type === 'warmup' ? 'working' : 'warmup'
}

function removeSet(exIndex, setIndex) {
  const s = activeWorkoutSession.value[exIndex].sets[setIndex]
  if (s.completed && s.setId) {
    workoutStore.removeSet(s.setId)
  }
  activeWorkoutSession.value[exIndex].sets.splice(setIndex, 1)
}

function saveSet(exIndex, setIndex) {
  const ex = activeWorkoutSession.value[exIndex]
  const s = ex.sets[setIndex]
  if (s.weight === '' || s.weight === null || s.weight === undefined || s.reps === '' || s.reps === null || s.reps === undefined) return

  s.completed = true

  // Save to Pinia (converted to canonical kg).
  // A superset / giant set rests only once, after its last exercise — so a set
  // logged on any earlier member of the group must not start the timer. The
  // rest that does fire is the last exercise's own, which is why restSeconds
  // still comes from the exercise being saved.
  s.setId = workoutStore.logSet(ex.id, toKg(s.weight, workoutStore.weightUnit), Number(s.reps), s.rpe || 0, {
    setType: s.set_type,
    restSeconds: ex.rx?.rest_seconds || null,
    startRest: isLastOfGroup(day.value, ex.id)
  })
}

function editSet(exIndex, setIndex) {
  const s = activeWorkoutSession.value[exIndex].sets[setIndex]
  s.completed = false
  if (s.setId) {
    workoutStore.removeSet(s.setId)
    s.setId = null
  }
}

// Exercise History Modal — loads that exercise's sessions 5 at a time,
// paginated on scroll, rather than reading the whole workout history.
const showExHistoryModal = ref(false)
const selectedExForHistory = ref(null)
const exHistoryLogs = ref([])
const exHistoryPage = ref(0)
const exHistoryLastPage = ref(1)
const loadingHistory = ref(false)      // first page
const loadingMoreHistory = ref(false)  // subsequent pages

function openExHistory(ex) {
  selectedExForHistory.value = ex
  showExHistoryModal.value = true
  exHistoryLogs.value = []
  exHistoryPage.value = 0
  exHistoryLastPage.value = 1
  loadExerciseHistory()
}

async function loadExerciseHistory() {
  if (loadingHistory.value || loadingMoreHistory.value) return
  const nextPage = exHistoryPage.value + 1
  if (nextPage > exHistoryLastPage.value && exHistoryPage.value !== 0) return

  const firstLoad = nextPage === 1
  if (firstLoad) loadingHistory.value = true
  else loadingMoreHistory.value = true

  try {
    const res = await api.get(`/exercises/${selectedExForHistory.value.id}/logs`, {
      params: { page: nextPage }
    })
    const mapped = res.data.data.map(log => ({
      logId: log.id,
      date: new Date(log.date_timestamp).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }),
      sets: log.sets
    }))
    exHistoryLogs.value = firstLoad ? mapped : [...exHistoryLogs.value, ...mapped]
    exHistoryPage.value = res.data.meta?.current_page || nextPage
    exHistoryLastPage.value = res.data.meta?.last_page || nextPage
  } catch (e) {
    console.error('Failed to load exercise history:', e)
  } finally {
    loadingHistory.value = false
    loadingMoreHistory.value = false
  }
}

function onHistoryScroll(e) {
  const el = e.target
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) {
    if (exHistoryPage.value < exHistoryLastPage.value) loadExerciseHistory()
  }
}

const showLeaveModal = ref(false)
const nextRoute = ref(null)
const isLeaving = ref(false)

// Post-save summary modal — the workout is already saved (or queued offline)
// by the time this shows; it doubles as the celebration/reward screen.
const showSavedModal = ref(false)
const savedOffline = ref(false)
const savedSummary = ref(null)
// Session notes typed into the summary modal. The workout is already saved by
// the time the modal shows, so notes are attached as a follow-up on dismissal.
const sessionNotes = ref('')

// Duration as "1h 12m" / "34m" / "45s".
function formatDuration(ms) {
  const totalSec = Math.round((ms || 0) / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}

// Total volume in the user's unit, compactly (e.g. "12,340 kg").
function formatVolume(volumeKg) {
  const v = Math.round(Number(formatWeight(volumeKg, workoutStore.weightUnit)))
  return `${v.toLocaleString()} ${workoutStore.weightUnit}`
}

// The workout is already saved by the time this modal shows, so any dismissal
// (Go Home, Escape, or backdrop) routes home. Guarded against a double push.
//
// Close the modal first and let its 300ms leave transition play out, THEN
// navigate. Routing immediately would unmount this view mid-animation and the
// modal would flick out instead of fading; waiting for the transition gives a
// clean, deliberate exit.
let navigatingHome = false
function goHome() {
  if (navigatingHome) return
  navigatingHome = true
  commitSessionNotes() // fire-and-forget; notes aren't on the critical path
  showSavedModal.value = false
  setTimeout(() => router.push('/'), 300) // matches .modal-fade leave duration
}

// Attach the typed notes to the just-saved workout. Online → PUT (updates the
// local history entry too); offline → patch the still-queued payload so the
// notes upload with it. Best-effort: a failure here never blocks navigation.
async function commitSessionNotes() {
  const notes = sessionNotes.value.trim()
  if (!notes || !savedSummary.value) return
  const { logId, clientUuid, status } = savedSummary.value
  try {
    if (status === 'offline') {
      syncStore.setNotes(clientUuid, notes)
    } else if (logId) {
      await historyStore.updateWorkout(logId, { notes })
    }
  } catch (e) {
    console.error('Failed to save workout notes:', e)
  }
}

const hasCompletedSets = computed(() => {
  return activeWorkoutSession.value.some(ex => ex.sets.some(s => s.completed))
})

// Typed-but-unsaved values count as changes too — losing them silently
// mid-workout is the worst possible failure mode.
const hasChanges = computed(() => {
  return activeWorkoutSession.value.some(ex =>
    ex.sets.some(s => s.completed || (s.weight !== '' && s.weight !== null) || (s.reps !== '' && s.reps !== null))
  )
})

function beforeUnloadGuard(e) {
  // Completed sets survive a refresh (persisted); typed-but-unsaved don't.
  const hasUnsavedTyped = activeWorkoutSession.value.some(ex =>
    ex.sets.some(s => !s.completed && ((s.weight !== '' && s.weight !== null) || (s.reps !== '' && s.reps !== null)))
  )
  if (hasUnsavedTyped) {
    e.preventDefault()
    e.returnValue = ''
  }
}

onBeforeRouteLeave((to, from) => {
  if (isLeaving.value) {
    return true
  }
  if (hasChanges.value) {
    showLeaveModal.value = true
    nextRoute.value = to.path
    return false
  }
})

function confirmLeave() {
  isLeaving.value = true
  showLeaveModal.value = false
  workoutStore.cancelWorkout()
  router.push(nextRoute.value || '/')
}

async function saveWorkout() {
  // Auto-save any sets that are filled but not saved yet
  activeWorkoutSession.value.forEach((ex, exIndex) => {
    ex.sets.forEach((s, setIndex) => {
      if (!s.completed && s.weight !== '' && s.weight !== null && s.weight !== undefined && s.reps !== '' && s.reps !== null && s.reps !== undefined) {
        saveSet(exIndex, setIndex)
      }
    })
  })

  if (!hasCompletedSets.value) {
    toast.error('Complete at least one set (weight and reps) before saving.')
    return
  }

  try {
    isSaving.value = true
    const result = await workoutStore.finishWorkout()
    // Session is saved (server) or safely queued (offline) — allow navigation
    // past the unsaved-changes guard and surface the result in a modal.
    isLeaving.value = true
    isSaving.value = false
    savedOffline.value = result?.status === 'offline'
    savedSummary.value = result
    sessionNotes.value = ''
    showSavedModal.value = true
  } catch {
    // A server rejection (e.g. 422) is surfaced as a toast by the interceptor.
    // Re-arm the unsaved-changes guard so the user can't silently lose the
    // session by navigating away after a failed save.
    isSaving.value = false
    isLeaving.value = false
  }
}
</script>

<template>
  <div class="active-workout">
    <div class="flex-row mb-24">
      <h1 class="title m-0">{{ day?.day_name || 'Workout' }}</h1>
    </div>

    <Transition name="page-fade" mode="out-in">
      <!-- Loading Skeleton State -->
      <div v-if="pageLoading" class="workout-skeleton" key="skeleton">
        <div class="skeleton-exercises">
          <div v-for="n in 3" :key="n" class="skeleton-exercise-card card skeleton-pulse">
            <div class="skeleton-exercise-header">
              <div class="skeleton-bar title-bar"></div>
              <div class="skeleton-bar right-bar"></div>
            </div>
            <div class="skeleton-sets-list">
              <div v-for="ex in 2" :key="ex" class="skeleton-set-row">
                <div class="skeleton-circle-small"></div>
                <div class="skeleton-bar input-bar"></div>
                <div class="skeleton-bar input-bar"></div>
                <div class="skeleton-bar input-bar rpe-bar"></div>
                <div class="skeleton-bar btn-bar"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="activeWorkoutSession.length > 0" class="exercises-container" key="content">
        <template v-for="(ex, exIndex) in activeWorkoutSession" :key="ex.id">
          <!-- Names the group above its first exercise; the members follow as
               their own cards, performed back to back. -->
          <div class="group-header" v-if="groupHeaderFor(ex)">
            <span class="group-header-label">{{ groupHeaderFor(ex).label }}</span>
            <span class="group-header-hint">{{ groupHeaderFor(ex).hint }}</span>
          </div>

          <div class="card exercise-card" :class="{ 'exercise-card--grouped': isGrouped(ex) }">
          <div class="flex-row ex-header ex-header-container">
            <div class="ex-title-block">
              <h2 class="subtitle m-0">{{ ex.exercise?.name || 'Exercise' }}</h2>
              <span v-if="exTypeTag(ex)" class="ex-type-tag">{{ exTypeTag(ex) }}</span>
              <span v-if="rxLabel(ex.rx)" class="rx-target-hint">{{ rxLabel(ex.rx) }}</span>
              <span v-if="ex.rx?.notes" class="rx-note">{{ ex.rx.notes }}</span>
              <span v-if="ex.prevSets && ex.prevSets.length > 0" class="prev-session-hint">
                Last: {{ formatPrevSets(ex.prevSets) }}
              </span>
            </div>
            <div class="ex-header-actions">
              <!-- History Button -->
              <button 
                class="icon-btn-header tap-target" 
                @click="openExHistory(ex)" 
                :title="ex.prevLoad ? `Prev: ${formatWeight(ex.prevLoad.weight, workoutStore.weightUnit)}${workoutStore.weightUnit} x ${ex.prevLoad.reps}` : 'Exercise History'"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </button>

              <!-- Add Set Button -->
              <button 
                class="icon-btn-header tap-target" 
                @click="addSet(exIndex)" 
                title="Add Set"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
            </div>
          </div>
          
          <TransitionGroup name="list-fade" tag="div" class="sets-list-container">
            <div v-for="(s, setIndex) in ex.sets" :key="s.localId" class="set-row" :class="{ 'is-completed': s.completed, 'is-warmup': s.set_type === 'warmup' }">
              <button
                class="set-col num-col warmup-toggle"
                :class="{ 'warmup-toggle--on': s.set_type === 'warmup' }"
                :disabled="s.completed"
                @click="toggleWarmup(s)"
                :title="s.set_type === 'warmup' ? 'Warm-up set (tap for working set)' : 'Tap to mark as warm-up set'"
                :aria-label="`Set ${setIndex + 1}: toggle warm-up`"
              >
                {{ s.set_type === 'warmup' ? 'W' : setIndex + 1 }}
              </button>
              <div class="set-col">
                <input
                  type="number"
                  inputmode="decimal"
                  class="input-large set-input"
                  v-model="s.weight"
                  :placeholder="workoutStore.weightUnit"
                  :aria-label="`Set ${setIndex + 1} weight (${workoutStore.weightUnit})`"
                  min="0"
                  :disabled="s.completed"
                />
              </div>
              <div class="set-col">
                <input
                  type="number"
                  inputmode="numeric"
                  class="input-large set-input"
                  v-model="s.reps"
                  placeholder="Reps"
                  :aria-label="`Set ${setIndex + 1} reps`"
                  min="1"
                  :disabled="s.completed"
                />
              </div>
              <div class="set-col rpe-col">
                <input
                  type="number"
                  inputmode="numeric"
                  class="input-large set-input"
                  v-model="s.rpe"
                  placeholder="RPE"
                  :aria-label="`Set ${setIndex + 1} RPE (optional, 1-10)`"
                  min="1"
                  max="10"
                  :disabled="s.completed"
                />
              </div>
              <div class="set-col action-col flex-row action-col-flex">
                <!-- Edit Button -->
                <PrimaryButton 
                  v-if="s.completed" 
                  class="btn-set-action" 
                  @click="editSet(exIndex, setIndex)" 
                  title="Edit Set"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                </PrimaryButton>

                <!-- Save Button -->
                <PrimaryButton 
                  v-else 
                  class="save-set-btn btn-set-action" 
                  :disabled="s.weight === '' || s.weight === null || s.weight === undefined || s.weight < 0 || s.reps === '' || s.reps === null || s.reps === undefined || s.reps < 1"
                  @click="saveSet(exIndex, setIndex)" 
                  title="Save Set"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </PrimaryButton>

                <!-- Delete Button -->
                <button 
                  class="btn-danger tap-target remove-set-btn btn-set-action" 
                  @click="removeSet(exIndex, setIndex)" 
                  title="Remove Set"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            </div>
          </TransitionGroup>

          </div>
        </template>

        <!-- Actions -->
        <div class="builder-actions" style="margin-top: 24px;">
          <button class="builder-delete-btn" @click="showLeaveModal = true" :disabled="!hasChanges || isSaving">
            Discard
          </button>

          <div class="builder-actions-divider"></div>

          <button class="builder-save-btn" @click="saveWorkout" :disabled="!hasChanges || isSaving" :class="{ 'builder-save-btn--active': hasChanges }">
            <div v-if="isSaving" class="spinner button-spinner"></div>
            {{ isSaving ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>

      <div v-else-if="!programStore.loading" class="card empty-state text-center py-24" style="margin-top: 16px;" key="empty">
        <p>There are no exercises added to this workout day yet. Please add some exercises first.</p>
        <PrimaryButton :to="'/builder/' + (day?.program_id || '')" class="inline-flex no-underline mt-16" style="justify-content: center;">
          Go to Program Builder
        </PrimaryButton>
      </div>
    </Transition>

    <!-- Post-save Summary Modal — doubles as the celebration/reward screen. -->
    <AppModal
      :show="showSavedModal"
      :title="savedOffline ? 'Saved Offline' : 'Workout Complete'"
      confirm-text="Go Home"
      hide-cancel
      @confirm="goHome"
      @update:show="(v) => { if (!v) goHome() }"
    >
      <div class="ws-summary" v-if="savedSummary">
        <p v-if="savedOffline" class="ws-offline-note">
          Saved offline — it'll sync automatically when you're back online.
        </p>

        <div class="ws-stats">
          <div class="ws-stat">
            <span class="ws-stat-value">{{ formatDuration(savedSummary.durationMs) }}</span>
            <span class="ws-stat-label">Duration</span>
          </div>
          <div class="ws-stat">
            <span class="ws-stat-value">{{ savedSummary.sets }}</span>
            <span class="ws-stat-label">Sets</span>
          </div>
          <div class="ws-stat">
            <span class="ws-stat-value">{{ formatVolume(savedSummary.volume) }}</span>
            <span class="ws-stat-label">Volume</span>
          </div>
        </div>

        <div v-if="savedSummary.prs && savedSummary.prs.length" class="ws-prs">
          <div class="ws-prs-title">🎉 New personal records</div>
          <ul class="ws-pr-list">
            <li v-for="pr in savedSummary.prs" :key="pr.exercise_id" class="ws-pr-item">
              <span class="ws-pr-name">{{ pr.exerciseName }}</span>
              <span class="ws-pr-lift">{{ formatWeight(pr.weight, workoutStore.weightUnit) }}{{ workoutStore.weightUnit }} × {{ pr.reps }}</span>
            </li>
          </ul>
        </div>

        <div class="ws-notes">
          <label for="ws-notes-input" class="ws-notes-label">Notes (optional)</label>
          <textarea
            id="ws-notes-input"
            v-model="sessionNotes"
            class="ws-notes-input"
            rows="3"
            maxlength="1000"
            placeholder="How did it go? Aches, PRs, form cues…"
          ></textarea>
        </div>
      </div>
    </AppModal>

    <!-- Unsaved Changes Modal -->
    <AppModal
      v-model:show="showLeaveModal"
      title="Unsaved Workout" 
      message="You have an active workout session in progress. Leaving this page will discard your logged sets for this session. Are you sure you want to leave?" 
      confirm-text="Leave" 
      cancel-text="Stay" 
      @confirm="confirmLeave" 
    />

    <!-- Exercise History Modal -->
    <AppModal
      v-model:show="showExHistoryModal"
      :title="(selectedExForHistory?.exercise?.name || '') + ' History'"
      confirm-text="Close"
      hide-cancel
      max-width="500px"
    >
      <div class="history-list-container mb-16" @scroll="onHistoryScroll">
        <div v-if="loadingHistory" class="spinner-container py-24 text-center">
          <div class="spinner" style="margin: 0 auto;"></div>
        </div>
        <div v-else-if="exHistoryLogs.length === 0" class="empty-state py-24 text-center">
          No history yet for this exercise.
        </div>
        <div v-else class="history-grid">
          <div v-for="entry in exHistoryLogs" :key="entry.logId" class="history-log-row">
            <div class="history-log-date">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              {{ entry.date }}
            </div>
            <div class="history-sets-grid">
              <div v-for="(set, sIdx) in entry.sets" :key="set.id" class="history-set-badge">
                <span class="history-set-badge-title">Set {{ sIdx + 1 }}:</span> {{ formatWeight(set.weight, workoutStore.weightUnit) }}{{ workoutStore.weightUnit }} x {{ set.reps }}<template v-if="set.rpe"> @{{ set.rpe }}</template>
              </div>
            </div>
          </div>
          <div v-if="loadingMoreHistory" class="spinner-container py-12 text-center">
            <div class="spinner" style="margin: 0 auto;"></div>
          </div>
        </div>
      </div>
    </AppModal>
  </div>
</template>

<style scoped>
.ex-title-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.prev-session-hint {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rx-target-hint {
  font-size: 12px;
  font-weight: 700;
  color: var(--primary-accent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Read-only coaching note from the program's prescription. Unlike the target /
   last-session hints it wraps (a cue is meant to be read in full) and preserves
   any line breaks the author typed in the builder. */
.rx-note {
  font-size: 12px;
  font-weight: 500;
  font-style: italic;
  color: var(--text-secondary);
  line-height: 1.35;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Names a superset / giant set above its first exercise. The members follow as
   ordinary cards, tied together by the accent rail below. */
.group-header {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 14px;
  margin-bottom: 8px;
  border-radius: 10px 10px 0 0;
  border: 1px solid rgba(204, 255, 0, 0.3);
  border-bottom: none;
  background: rgba(204, 255, 0, 0.06);
}

.group-header-label {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--primary-accent);
}

.group-header-hint {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  line-height: 1.35;
}

/* A grouped exercise carries an accent rail so the eye can tell where the group
   starts and stops in a flat list of cards. */
.exercise-card--grouped {
  border-left: 3px solid rgba(204, 255, 0, 0.45);
}

/* "Drop Set" / "Pyramid Set" — a tag on a single exercise. */
.ex-type-tag {
  align-self: flex-start;
  padding: 3px 8px;
  border-radius: 5px;
  border: 1px solid rgba(204, 255, 0, 0.4);
  background: rgba(204, 255, 0, 0.08);
  color: var(--primary-accent);
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.warmup-toggle {
  background: none;
  border: 1px dashed transparent;
  border-radius: 6px;
  color: inherit;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  padding: 4px 0;
}

.warmup-toggle:not(:disabled):hover {
  border-color: var(--border-color);
}

.warmup-toggle--on {
  color: #f9ca24;
}

.set-row.is-warmup .set-input {
  opacity: 0.85;
}

/* ---- Post-save workout summary ---- */
.ws-summary {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ws-offline-note {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-secondary);
}

.ws-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.ws-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 8px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  text-align: center;
}

.ws-stat-value {
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary, #fff);
  line-height: 1.1;
}

.ws-stat-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}

.ws-prs {
  padding: 14px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background-color: var(--bg-surface);
}

.ws-notes {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ws-notes-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}

.ws-notes-input {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 68px;
  padding: 10px 12px;
  font: inherit;
  font-size: 14px;
  line-height: 1.4;
  color: var(--text-primary);
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.ws-notes-input:focus {
  outline: none;
  border-color: var(--primary-accent);
}

.ws-notes-input::placeholder {
  color: var(--text-secondary);
}

.ws-prs-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--primary-accent);
  margin-bottom: 12px;
}

.ws-pr-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ws-pr-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.ws-pr-name {
  font-size: 14px;
  font-weight: 700;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-pr-lift {
  flex: 0 0 auto;
  font-size: 14px;
  font-weight: 800;
  color: var(--primary-accent);
  white-space: nowrap;
}

@media (max-width: 340px) {
  .ws-stat-value {
    font-size: 16px;
  }
  .ws-stat {
    padding: 12px 4px;
  }
}
</style>
