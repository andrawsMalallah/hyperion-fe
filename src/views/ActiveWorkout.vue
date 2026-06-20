<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { useProgramStore } from '../stores/program'
import { useWorkoutStore } from '../stores/workout'
import { useExerciseStore } from '../stores/exercise'
import { useHistoryStore } from '../stores/history'
import AppModal from '../components/AppModal.vue'
import PrimaryButton from '../components/PrimaryButton.vue'

const props = defineProps({
  dayId: String
})

const router = useRouter()
const splitStore = useProgramStore()
const workoutStore = useWorkoutStore()
const exerciseStore = useExerciseStore()
const historyStore = useHistoryStore()

// If dayId isn't found locally, it's fine, we try to match it.
// To handle the API type (it could be an integer ID now from the API)
const parsedDayId = isNaN(Number(props.dayId)) ? props.dayId : Number(props.dayId);
const day = computed(() => splitStore.split_days.find(d => d.id === parsedDayId))

// This is local component state to manage the UI structure
const activeWorkoutSession = ref([])
const pageLoading = ref(true)
const errorMsg = ref('')
const validationErrors = ref({})

const errorList = computed(() => {
  if (Object.keys(validationErrors.value).length > 0) {
    return Object.values(validationErrors.value).flat()
  }
  if (errorMsg.value) {
    return [errorMsg.value]
  }
  return []
})

onMounted(async () => {
  pageLoading.value = true
  await splitStore.fetchSingleSplitByDay(parsedDayId)

  if (workoutStore.activeWorkoutDayId !== parsedDayId) {
    workoutStore.startWorkout(parsedDayId)
  }
  
  if (day.value && activeWorkoutSession.value.length === 0) {
    activeWorkoutSession.value = day.value.exercises.map(exId => {
      const exercise = exerciseStore.exercises.find(e => e.id === exId)
      const prevLoad = workoutStore.getPreviousLoad(exId)
      
      // Load existing sets logged during this active workout session (from activeWorkoutSets)
      const existingSets = workoutStore.activeWorkoutSets
        .filter(s => s.exercise_id === exId)
        .map(s => ({
          localId: s.id,
          weight: s.weight,
          reps: s.reps,
          completed: true,
          setId: s.id
        }))
      
      return {
        id: exId,
        exercise,
        prevLoad,
        sets: existingSets
      }
    })
  }
  pageLoading.value = false
})

function addSet(exIndex) {
  activeWorkoutSession.value[exIndex].sets.push({
    localId: Date.now() + Math.random(),
    weight: '',
    reps: '',
    completed: false,
    setId: null
  })
}

function removeSet(exIndex, setIndex) {
  const s = activeWorkoutSession.value[exIndex].sets[setIndex]
  if (s.completed && s.setId) {
    workoutStore.removeSet(s.setId)
  }
  activeWorkoutSession.value[exIndex].sets.splice(setIndex, 1)
}

function saveSet(exIndex, setIndex) {
  const s = activeWorkoutSession.value[exIndex].sets[setIndex]
  if (s.weight === '' || s.weight === null || s.weight === undefined || s.reps === '' || s.reps === null || s.reps === undefined) return
  
  s.completed = true
  
  // Save to Pinia
  workoutStore.logSet(activeWorkoutSession.value[exIndex].id, Number(s.weight), Number(s.reps), 0)
  
  // Assign setId from the last pushed set
  const logs = workoutStore.activeWorkoutSets
  s.setId = logs[logs.length - 1].id
}

function editSet(exIndex, setIndex) {
  const s = activeWorkoutSession.value[exIndex].sets[setIndex]
  s.completed = false
  if (s.setId) {
    workoutStore.removeSet(s.setId)
    s.setId = null
  }
}

// Exercise History Modal
const showExHistoryModal = ref(false)
const selectedExForHistory = ref(null)
const loadingHistory = ref(false)

async function openExHistory(ex) {
  selectedExForHistory.value = ex
  showExHistoryModal.value = true
  
  if (historyStore.workout_logs.length === 0) {
    loadingHistory.value = true
    try {
      await historyStore.fetchHistory(false, false)
    } catch (e) {
      console.error('Failed to load history:', e)
    } finally {
      loadingHistory.value = false
    }
  }
}

const exerciseHistory = computed(() => {
  if (!selectedExForHistory.value) return []
  const exId = selectedExForHistory.value.id
  
  return historyStore.workout_logs
    .filter(log => log.sets && log.sets.some(s => s.exercise_id === exId))
    .map(log => {
      const sets = log.sets
        .filter(s => s.exercise_id === exId)
        .sort((a, b) => a.set_order - b.set_order)
      return {
        logId: log.id,
        date: new Date(log.date_timestamp).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short'
        }),
        timestamp: new Date(log.date_timestamp).getTime(),
        sets
      }
    })
    .sort((a, b) => b.timestamp - a.timestamp)
})

const showLeaveModal = ref(false)
const nextRoute = ref(null)
const isLeaving = ref(false)

const hasChanges = computed(() => {
  return activeWorkoutSession.value.some(ex => ex.sets.some(s => s.completed))
})

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
  errorMsg.value = ''
  validationErrors.value = {}

  // Auto-save any sets that are filled but not saved yet
  activeWorkoutSession.value.forEach((ex, exIndex) => {
    ex.sets.forEach((s, setIndex) => {
      if (!s.completed && s.weight !== '' && s.weight !== null && s.weight !== undefined && s.reps !== '' && s.reps !== null && s.reps !== undefined) {
        saveSet(exIndex, setIndex)
      }
    })
  })

  try {
    isLeaving.value = true
    await workoutStore.finishWorkout()
    router.push('/')
  } catch (error) {
    isLeaving.value = false
    if (error.response && error.response.status === 422) {
      validationErrors.value = error.response.data.errors || {}
    } else if (error.response && error.response.data && error.response.data.message) {
      errorMsg.value = error.response.data.message
    } else {
      errorMsg.value = 'Failed to save workout. Please try again.'
    }
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
          <div v-for="n in 2" :key="n" class="skeleton-exercise-card card skeleton-pulse">
            <div class="skeleton-exercise-header">
              <div class="skeleton-bar title-bar"></div>
              <div class="skeleton-bar right-bar"></div>
            </div>
            <div class="skeleton-sets-list">
              <div v-for="ex in 2" :key="ex" class="skeleton-set-row">
                <div class="skeleton-circle-small"></div>
                <div class="skeleton-bar input-bar"></div>
                <div class="skeleton-bar input-bar"></div>
                <div class="skeleton-bar btn-bar"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="activeWorkoutSession.length > 0" class="exercises-container" key="content">
        <div v-for="(ex, exIndex) in activeWorkoutSession" :key="ex.id" class="card exercise-card">
          <div class="flex-row ex-header ex-header-container">
            <h2 class="subtitle m-0">{{ ex.exercise?.name || 'Exercise' }}</h2>
            <div class="ex-header-actions">
              <!-- History Button -->
              <button 
                class="icon-btn-header tap-target" 
                @click="openExHistory(ex)" 
                :title="ex.prevLoad ? `Prev: ${ex.prevLoad.weight}${workoutStore.weightUnit} x ${ex.prevLoad.reps}` : 'Exercise History'"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
            </div>
          </div>
          
          <div class="sets-header" v-if="ex.sets.length > 0">
            <div class="set-col num-col">Set</div>
            <div class="set-col">{{ workoutStore.weightUnit }}</div>
            <div class="set-col">Reps</div>
            <div class="set-col action-col text-right">Actions</div>
          </div>

          <TransitionGroup name="list-fade" tag="div" class="sets-list-container">
            <div v-for="(s, setIndex) in ex.sets" :key="s.localId" class="set-row" :class="{ 'is-completed': s.completed }">
              <div class="set-col num-col">{{ setIndex + 1 }}</div>
              <div class="set-col">
                <input 
                  type="number" 
                  class="input-large set-input" 
                  v-model="s.weight" 
                  placeholder="10"
                  min="1"
                  :disabled="s.completed"
                />
              </div>
              <div class="set-col">
                <input 
                  type="number" 
                  class="input-large set-input" 
                  v-model="s.reps" 
                  placeholder="8"
                  min="1"
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
                  :disabled="s.weight === '' || s.weight === null || s.weight === undefined || s.weight < 1 || s.reps === '' || s.reps === null || s.reps === undefined || s.reps < 1"
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

        <!-- Error Alert -->
        <div v-if="errorList.length > 0" class="error-msg" style="margin-top: 24px; margin-bottom: -8px;">
          <ul style="margin: 0; padding-left: 20px;">
            <li v-for="(err, index) in errorList" :key="index">{{ err }}</li>
          </ul>
        </div>

        <!-- Actions -->
        <div class="builder-actions" style="margin-top: 24px;">
          <button class="builder-delete-btn" @click="showLeaveModal = true" :disabled="!hasChanges">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Discard
          </button>

          <div class="builder-actions-divider"></div>

          <button class="builder-save-btn" @click="saveWorkout" :disabled="!hasChanges" :class="{ 'builder-save-btn--active': hasChanges }">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            Save Workout
          </button>
        </div>
      </div>

      <div v-else-if="!splitStore.loading" class="card empty-state text-center py-24" style="margin-top: 16px;" key="empty">
        <p>There are no exercises added to this workout day yet. Please add some exercises first.</p>
        <PrimaryButton :to="'/builder/' + (day?.split_id || '')" class="inline-flex no-underline mt-16" style="justify-content: center;">
          Go to Program Builder
        </PrimaryButton>
      </div>
    </Transition>

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
      <div class="history-list-container mb-16">
        <div v-if="loadingHistory" class="spinner-container py-24 text-center">
          <div class="spinner" style="margin: 0 auto;"></div>
        </div>
        <div v-else-if="exerciseHistory.length === 0" class="empty-state py-24 text-center">
          No history yet for this exercise.
        </div>
        <div v-else class="history-grid">
          <div v-for="entry in exerciseHistory" :key="entry.logId" class="history-log-row">
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
                <span class="history-set-badge-title">Set {{ sIdx + 1 }}:</span> {{ set.weight }}{{ workoutStore.weightUnit }} x {{ set.reps }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppModal>
  </div>
</template>
