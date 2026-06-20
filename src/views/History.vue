<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useHistoryStore } from '../stores/history'
import { useWorkoutStore } from '../stores/workout'
import PrimaryButton from '../components/PrimaryButton.vue'

const router = useRouter()
const historyStore = useHistoryStore()
const workoutStore = useWorkoutStore()

const rawLogs = computed(() => historyStore.workout_logs)
const loading = computed(() => historyStore.historyLoading)
const hasMore = computed(() => historyStore.historyHasMore)

const loaderRef = ref(null)
let observer = null

async function fetchHistory(reset = false) {
  await historyStore.fetchHistory(reset, !reset)
}

const pastWorkouts = computed(() => {
  return [...rawLogs.value]
    .map(log => {
      const day = log.day
      const Program = day?.Program
      
      const sets = log.sets || []
      const numExercises = new Set(sets.map(s => s.exercise_id)).size
      
      // Group sets by exercise
      const exerciseGroupsMap = new Map()
      sets.forEach(s => {
        if (!exerciseGroupsMap.has(s.exercise_id)) {
          const ex = s.exercise
          exerciseGroupsMap.set(s.exercise_id, {
            exerciseName: ex ? ex.name : 'Unknown Exercise',
            sets: []
          })
        }
        exerciseGroupsMap.get(s.exercise_id).sets.push(s)
      })

      const exerciseGroups = Array.from(exerciseGroupsMap.values()).map(group => {
        group.sets.sort((a, b) => a.set_order - b.set_order)
        return group
      })
      
      return {
        ...log,
        dateStr: new Date(log.date_timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
        dayName: day ? day.day_name : 'Unknown Day',
        ProgramName: Program ? Program.name : 'Unknown Program',
        totalVolume: sets.reduce((acc, s) => acc + (s.weight * s.reps), 0),
        numExercises,
        numSets: sets.length,
        exerciseGroups
      }
    })
})

function setupObserver() {
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !loading.value && hasMore.value) {
      fetchHistory()
    }
  }, { rootMargin: '100px' })

  if (loaderRef.value) {
    observer.observe(loaderRef.value)
  }
}

onMounted(async () => {
  await historyStore.fetchHistory(false, false)
  setupObserver()
})

onUnmounted(() => {
  if (observer) {
    observer.disconnect()
  }
})
</script>

<template>
  <div class="history-page">
    <!-- Header with Back Button -->
    <div class="flex-row mb-24 gap-12" style="align-items: center;">
      <button class="btn-secondary back-btn tap-target" @click="router.push('/')" title="Back to Home" style="width: 36px; height: 36px; min-width: 36px; min-height: 36px; padding: 0; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <h1 class="title m-0">Workout History</h1>
    </div>

    <!-- Loading Skeleton (Initial Load) -->
    <div v-if="loading && pastWorkouts.length === 0" class="history-list">
      <div v-for="n in 3" :key="n" class="card history-card mb-24 skeleton-pulse" style="min-height: 200px;">
        <div class="history-header pb-12" style="border-bottom: 1px solid var(--border-color);">
          <div class="skeleton-bar title-bar" style="width: 140px; height: 18px; margin-bottom: 8px;"></div>
          <div class="skeleton-bar text-bar" style="width: 100px; height: 14px; margin-bottom: 6px;"></div>
          <div class="skeleton-bar text-bar" style="width: 80px; height: 12px;"></div>
        </div>
        <div class="history-stats-grid mb-16" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px;">
          <div v-for="i in 3" :key="i" class="skeleton-bar" style="height: 52px; border-radius: 8px; background: var(--bg-surface-hover);"></div>
        </div>
      </div>
    </div>

    <!-- Workout Logs List -->
    <TransitionGroup v-else-if="pastWorkouts.length > 0" name="list-fade" tag="div" class="history-list">
      <div v-for="w in pastWorkouts" :key="w.id" class="card history-card mb-24">
        <!-- Header -->
        <div class="history-header pb-12">
          <div class="header-main-info">
            <h2 class="subtitle m-0 text-accent" style="font-weight: 700;">{{ w.dayName }}</h2>
            <span class="history-Program-tag">{{ w.ProgramName }}</span>
          </div>
          <span class="history-date-badge">{{ w.dateStr }}</span>
        </div>

        <!-- Stats Grid (Premium visual summary) -->
        <div class="history-stats-grid mb-20">
          <div class="history-stat-box">
            <span class="stat-label">Exercises</span>
            <span class="stat-val">{{ w.numExercises }}</span>
          </div>
          <div class="history-stat-box">
            <span class="stat-label">Sets Completed</span>
            <span class="stat-val">{{ w.numSets }}</span>
          </div>
          <div class="history-stat-box">
            <span class="stat-label">Total Volume</span>
            <span class="stat-val">{{ w.totalVolume }} <span style="font-size: 11px; font-weight: 600; color: var(--text-secondary);">{{ workoutStore.weightUnit }}</span></span>
          </div>
        </div>

        <!-- Exercises and Logged Sets list -->
        <div v-if="w.exerciseGroups && w.exerciseGroups.length > 0" class="history-exercises-list">
          <div v-for="(group, idx) in w.exerciseGroups" :key="idx" class="history-exercise-group mb-16">
            <h4 class="history-ex-name m-0">{{ group.exerciseName }}</h4>
            <div class="history-sets-flex mt-8">
              <div v-for="(set, sIdx) in group.sets" :key="set.id" class="history-set-pill">
                <span class="set-num-label">S{{ sIdx + 1 }}</span>
                <span class="set-val-label">{{ set.weight }}{{ workoutStore.weightUnit }} x {{ set.reps }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TransitionGroup>

    <!-- Empty State -->
    <div v-else-if="!loading" class="empty-state card py-40 text-center">
      <p style="color: var(--text-secondary); margin: 0 0 16px 0;">No workouts logged yet. Your fitness journey starts here!</p>
      <PrimaryButton to="/" class="inline-flex no-underline px-24" style="justify-content: center; max-width: max-content; margin: 0 auto;">
        Go to Home
      </PrimaryButton>
    </div>

    <!-- Loading Spinner / Footer -->
    <div class="footer-loader" ref="loaderRef" style="display: flex; justify-content: center; align-items: center; min-height: 45px; box-sizing: border-box; margin-top: 16px;">
      <div v-if="loading && pastWorkouts.length > 0" class="spinner" style="width: 24px; height: 24px; border-width: 3px;"></div>
      <div v-else-if="!hasMore && pastWorkouts.length > 0" class="end-message" style="margin: 0;">
        No more data to display
      </div>
    </div>
  </div>
</template>

<style scoped>
.back-btn {
  transition: all 0.2s ease;
}

.back-btn:hover {
  background-color: var(--bg-surface-hover);
  color: var(--primary-accent);
  border-color: var(--primary-accent);
  transform: translateX(-1px);
}

.back-btn:active {
  transform: translateX(0);
}

.history-card {
  padding: 24px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 1px solid var(--border-color);
}

.header-main-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-Program-tag {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

.history-date-badge {
  background-color: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
}

.history-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 16px;
}

.history-stat-box {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px;
  text-align: center;
}

.stat-label {
  font-size: 10px;
  font-weight: 800;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.stat-val {
  font-size: 16px;
  font-weight: 700;
  color: var(--primary-accent);
}

.history-exercises-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.history-exercise-group {
  background-color: rgba(255, 255, 255, 0.01);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px 16px;
  border-left: 3px solid var(--primary-accent);
}

.history-ex-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.history-sets-flex {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.history-set-pill {
  display: inline-flex;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 12px;
  overflow: hidden;
}

.set-num-label {
  background-color: rgba(204, 255, 0, 0.08);
  color: var(--primary-accent);
  font-weight: 800;
  padding: 4px 8px;
  border-right: 1px solid var(--border-color);
}

.set-val-label {
  padding: 4px 8px;
  color: var(--text-primary);
  font-weight: 600;
}
</style>
