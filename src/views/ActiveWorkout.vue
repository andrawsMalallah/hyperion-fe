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
import ExerciseHistoryModal from '../components/ExerciseHistoryModal.vue'
import WorkoutSummaryModal from '../components/WorkoutSummaryModal.vue'
import SetRow from '../components/SetRow.vue'
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

// Exercise History Modal — the modal owns its own fetching and pagination.
const showExHistoryModal = ref(false)
const selectedExForHistory = ref(null)

function openExHistory(ex) {
  selectedExForHistory.value = ex
  showExHistoryModal.value = true
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
            <SetRow
              v-for="(s, setIndex) in ex.sets"
              :key="s.localId"
              :set="s"
              :index="setIndex"
              :weight-unit="workoutStore.weightUnit"
              @toggle-warmup="toggleWarmup(s)"
              @save="saveSet(exIndex, setIndex)"
              @edit="editSet(exIndex, setIndex)"
              @remove="removeSet(exIndex, setIndex)"
            />
          </TransitionGroup>

          </div>
        </template>

        <!-- Actions -->
        <div class="builder-actions workout-actions">
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

      <div v-else-if="!programStore.loading" class="card empty-state empty-day-state text-center py-24" key="empty">
        <p>There are no exercises added to this workout day yet. Please add some exercises first.</p>
        <PrimaryButton :to="'/builder/' + (day?.program_id || '')" class="inline-flex no-underline mt-16 go-builder-btn">
          Go to Program Builder
        </PrimaryButton>
      </div>
    </Transition>

    <!-- Post-save summary — doubles as the celebration/reward screen. -->
    <WorkoutSummaryModal
      :show="showSavedModal"
      :summary="savedSummary"
      :offline="savedOffline"
      v-model:notes="sessionNotes"
      @dismiss="goHome"
    />

    <!-- Unsaved Changes Modal -->
    <AppModal
      v-model:show="showLeaveModal"
      title="Unsaved Workout" 
      message="You have an active workout session in progress. Leaving this page will discard your logged sets for this session. Are you sure you want to leave?" 
      confirm-text="Leave" 
      cancel-text="Stay" 
      @confirm="confirmLeave" 
    />

    <ExerciseHistoryModal v-model:show="showExHistoryModal" :exercise="selectedExForHistory" />
  </div>
</template>

<style scoped>
/* Spacing/centering that used to live inline on the elements. */
.workout-actions {
  margin-top: 24px;
}

.empty-day-state {
  margin-top: 16px;
}

.go-builder-btn {
  justify-content: center;
}

.spinner-centered {
  margin: 0 auto;
}

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

</style>
