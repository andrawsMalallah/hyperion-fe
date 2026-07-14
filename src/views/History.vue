<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useHistoryStore } from '../stores/history'
import { useWorkoutStore } from '../stores/workout'
import PrimaryButton from '../components/PrimaryButton.vue'
import AppModal from '../components/AppModal.vue'
import EditWorkoutModal from '../components/EditWorkoutModal.vue'
import { useToastStore } from '../stores/toast'
import { formatWeight } from '../utils/units'

const router = useRouter()
const historyStore = useHistoryStore()
const workoutStore = useWorkoutStore()
const toast = useToastStore()

// Per-card overflow (⋯) menu, delete confirm, and edit modal.
const openMenuId = ref(null)
const showDeleteModal = ref(false)
const deleteTarget = ref(null)
const deleting = ref(false)
const showEditModal = ref(false)
const editTarget = ref(null)

function toggleMenu(id) {
  openMenuId.value = openMenuId.value === id ? null : id
}

function closeMenu() {
  openMenuId.value = null
}

function askDelete(w) {
  closeMenu()
  deleteTarget.value = w
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!deleteTarget.value || deleting.value) return
  deleting.value = true
  try {
    await historyStore.deleteWorkout(deleteTarget.value.id)
    toast.success('Workout deleted')
    showDeleteModal.value = false
    deleteTarget.value = null
  } catch (e) {
    console.error('Failed to delete workout:', e)
  } finally {
    deleting.value = false
  }
}

function openEdit(w) {
  closeMenu()
  // Pass the raw log (with grouped sets + exercise) the store holds.
  editTarget.value = rawLogs.value.find(l => l.id === w.id) || null
  showEditModal.value = true
}

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
      const program = day?.program

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
      
      let durationMin = null
      if (log.ended_at) {
        const ms = new Date(log.ended_at) - new Date(log.date_timestamp)
        if (ms > 0) durationMin = Math.round(ms / 60000)
      }

      return {
        ...log,
        dateStr: new Date(log.date_timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
        dayName: day ? day.day_name : 'Unknown Day',
        ProgramName: program ? program.name : 'Unknown Program',
        // Warm-up sets don't count toward volume.
        totalVolume: sets.reduce((acc, s) => acc + ((s.set_type || 'working') !== 'warmup' ? s.weight * s.reps : 0), 0),
        durationMin,
        numExercises,
        numSets: sets.length,
        exerciseGroups
      }
    })
})

function setupObserver() {
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !loading.value && hasMore.value && !historyStore.loadFailed) {
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
      <button class="btn-secondary back-btn tap-target" @click="router.push('/')" title="Back to Home" style="width: 32px; height: 32px; min-width: 32px; min-height: 32px; padding: 0; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <h1 class="title m-0">Workout History</h1>
      <router-link to="/progress" class="btn-secondary tap-target no-underline progress-link" style="margin-left: auto; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
          <polyline points="17 6 23 6 23 12"></polyline>
        </svg>
        Progress
      </router-link>
    </div>

    <!-- Loading Skeleton (Initial Load) — mirrors the real workout card -->
    <div v-if="loading && pastWorkouts.length === 0" class="history-list" aria-hidden="true">
      <div v-for="n in 3" :key="n" class="card history-card mb-24">
        <!-- Header: left day/program info + right date badge -->
        <div class="history-header pb-12 sk-header">
          <div class="header-main-info">
            <div class="sk sk-shimmer" style="width: 150px; height: 20px;"></div>
            <div class="sk sk-shimmer" style="width: 100px; height: 13px;"></div>
          </div>
          <div class="sk sk-shimmer" style="width: 110px; height: 24px; border-radius: 6px;"></div>
        </div>

        <!-- Stats grid: 3 tiles matching the real summary -->
        <div class="history-stats-grid mb-24">
          <div v-for="i in 3" :key="i" class="history-stat-box sk-stat-box">
            <div class="sk sk-shimmer" style="width: 54px; height: 9px; margin-bottom: 8px;"></div>
            <div class="sk sk-shimmer" style="width: 36px; height: 18px;"></div>
          </div>
        </div>

        <!-- Two exercise-group placeholders with set pills -->
        <div class="history-exercises-list">
          <div v-for="i in 2" :key="'ex-' + i" class="history-exercise-group">
            <div class="sk sk-shimmer" style="width: 130px; height: 14px;"></div>
            <div class="history-sets-flex mt-8">
              <div v-for="p in (i === 1 ? 4 : 3)" :key="p" class="sk sk-shimmer" style="width: 82px; height: 24px; border-radius: 6px;"></div>
            </div>
          </div>
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
          <div class="history-header-right">
            <span class="history-date-badge">{{ w.dateStr }}</span>
            <div class="history-menu-wrap">
              <button class="history-menu-btn" @click.stop="toggleMenu(w.id)" :aria-expanded="openMenuId === w.id" aria-haspopup="true" title="Workout actions" aria-label="Workout actions">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="5" r="1.6"></circle>
                  <circle cx="12" cy="12" r="1.6"></circle>
                  <circle cx="12" cy="19" r="1.6"></circle>
                </svg>
              </button>
              <div v-if="openMenuId === w.id" class="history-menu" @click.stop>
                <button class="history-menu-item" @click="openEdit(w)">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
                  Edit
                </button>
                <button class="history-menu-item history-menu-item--danger" @click="askDelete(w)">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Stats Grid (Premium visual summary) -->
        <div class="history-stats-grid mb-24">
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
            <span class="stat-val">{{ formatWeight(w.totalVolume, workoutStore.weightUnit) }} <span style="font-size: 11px; font-weight: 600; color: var(--text-secondary);">{{ workoutStore.weightUnit }}</span></span>
          </div>
          <div v-if="w.durationMin" class="history-stat-box">
            <span class="stat-label">Duration</span>
            <span class="stat-val">{{ w.durationMin }} <span style="font-size: 11px; font-weight: 600; color: var(--text-secondary);">min</span></span>
          </div>
        </div>

        <!-- Exercises and Logged Sets list -->
        <div v-if="w.exerciseGroups && w.exerciseGroups.length > 0" class="history-exercises-list">
          <div v-for="(group, idx) in w.exerciseGroups" :key="idx" class="history-exercise-group">
            <h4 class="history-ex-name m-0">{{ group.exerciseName }}</h4>
            <div class="history-sets-flex mt-8">
              <div v-for="(set, sIdx) in group.sets" :key="set.id" class="history-set-pill">
                <span class="set-num-label">{{ (set.set_type || 'working') === 'warmup' ? 'W' : 'S' + (sIdx + 1) }}</span>
                <span class="set-val-label">{{ formatWeight(set.weight, workoutStore.weightUnit) }}{{ workoutStore.weightUnit }} x {{ set.reps }}<template v-if="set.rpe"> @{{ set.rpe }}</template></span>
              </div>
            </div>
          </div>
        </div>

        <!-- Session notes -->
        <div v-if="w.notes" class="history-notes">
          <span class="history-notes-label">Notes</span>
          <p class="history-notes-text">{{ w.notes }}</p>
        </div>
      </div>
    </TransitionGroup>

    <!-- Error State -->
    <div v-else-if="historyStore.loadFailed" class="empty-state card py-40 text-center">
      <p style="color: var(--text-secondary); margin: 0 0 16px 0;">Couldn't load your workout history.</p>
      <PrimaryButton class="inline-flex px-24" style="justify-content: center; max-width: max-content; margin: 0 auto;" @click="fetchHistory(true)">
        Try Again
      </PrimaryButton>
    </div>

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
      <button v-else-if="historyStore.loadFailed && pastWorkouts.length > 0" class="btn-secondary tap-target px-24" @click="fetchHistory()">
        Retry loading more
      </button>
      <div v-else-if="!hasMore && pastWorkouts.length > 0" class="end-message" style="margin: 0;">
        No more data to display
      </div>
    </div>

    <!-- Click-catcher to dismiss an open overflow menu -->
    <div v-if="openMenuId !== null" class="history-menu-backdrop" @click="closeMenu"></div>

    <!-- Delete confirm -->
    <AppModal
      v-model:show="showDeleteModal"
      title="Delete workout?"
      message="This permanently removes this logged workout and all its sets. This can't be undone."
      confirm-text="Delete"
      cancel-text="Cancel"
      @confirm="confirmDelete"
    />

    <!-- Edit workout -->
    <EditWorkoutModal
      v-model:show="showEditModal"
      :workout="editTarget"
      :weight-unit="workoutStore.weightUnit"
    />
  </div>
</template>

<style scoped>
/* Header row: keep the Progress pill (and its icon) at natural size — on a
   narrow phone the long title would otherwise squeeze the flex row and
   collapse the SVG. Let the title absorb the squeeze / wrap instead. */
.history-page .flex-row > .title {
  min-width: 0;
}

.progress-link {
  flex-shrink: 0;
}

.progress-link svg {
  flex-shrink: 0;
}

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

.history-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* Overflow (⋯) menu */
.history-menu-wrap {
  position: relative;
}

.history-menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 23px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background-color: rgba(255, 255, 255, 0.02);
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.2s ease, border-color 0.2s ease;
}

@media (hover: hover) {
  .history-menu-btn:hover {
    color: var(--primary-accent);
    border-color: var(--primary-accent);
  }
}

.history-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  min-width: 148px;
  padding: 6px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.history-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}

@media (hover: hover) {
  .history-menu-item:hover {
    background-color: var(--bg-surface-hover);
  }
}

.history-menu-item--danger {
  color: var(--danger, #ff5252);
}

/* Full-screen catcher so any outside click closes the menu. */
.history-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  background: transparent;
}

/* Session notes */
.history-notes {
  margin-top: 16px;
  padding: 12px 14px;
  background-color: rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.history-notes-label {
  display: block;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.history-notes-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
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
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

/* Small screens: 2×2 instead of the lopsided 3-then-1 auto-fit row. */
@media (max-width: 520px) {
  .history-stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
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
  gap: 12px;
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

/* --- Loading skeleton --- */
/* A skeleton block with a moving sheen, so the placeholders feel alive rather
   than flat gray. Shapes reuse the real card layout (.history-header,
   .history-stats-grid, .history-exercise-group) for a zero-shift transition. */
.sk {
  background: var(--bg-surface-hover);
  border-radius: 6px;
  flex-shrink: 0;
}

.sk-shimmer {
  position: relative;
  overflow: hidden;
}

.sk-shimmer::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.06) 50%,
    transparent 100%
  );
  animation: sk-sheen 1.4s infinite;
}

@keyframes sk-sheen {
  100% { transform: translateX(100%); }
}

/* Skeleton header aligns its two rows to the top like the real one. */
.sk-header {
  align-items: flex-start;
}

.sk-header .header-main-info {
  gap: 8px;
}

/* Skeleton stat tiles keep the real tile chrome but drop the text centering
   so the two bars stack naturally. */
.sk-stat-box {
  gap: 0;
}

@media (prefers-reduced-motion: reduce) {
  .sk-shimmer::after {
    animation: none;
  }
}
</style>
