<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProgramStore } from '../stores/program'
import { useWorkoutStore } from '../stores/workout'
import { useSyncStore } from '../stores/sync'
import { useAuthStore } from '../stores/auth'
import PrimaryButton from '../components/PrimaryButton.vue'
import AppModal from '../components/AppModal.vue'
import ProgramShowcase from '../components/ProgramShowcase.vue'
import SavedProgramCard from '../components/SavedProgramCard.vue'

import { OverlayScrollbars } from 'overlayscrollbars'

const router = useRouter()
const programStore = useProgramStore()
const workoutStore = useWorkoutStore()
const syncStore = useSyncStore()
const authStore = useAuthStore()

const userprograms = computed(() => {
  return [...programStore.user_programs].sort((a, b) => {
    if (a.is_active === b.is_active) {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    }
    return a.is_active ? -1 : 1;
  });
})

function getProgramDays(programId) {
  return programStore.program_days
    .filter(d => d.program_id === programId)
    .sort((a, b) => a.display_order - b.display_order)
}

// In-progress session handling: never silently wipe logged sets.
const showSwitchModal = ref(false)
const pendingDayId = ref(null)

const inProgressDay = computed(() => {
  if (!workoutStore.hasActiveSession()) return null
  return programStore.program_days.find(d => d.id === workoutStore.activeWorkoutDayId) || null
})

function startWorkout(dayId) {
  if (workoutStore.hasActiveSession() && workoutStore.activeWorkoutDayId !== dayId) {
    pendingDayId.value = dayId
    showSwitchModal.value = true
    return
  }
  workoutStore.startWorkout(dayId)
  router.push(`/workout/${dayId}`)
}

function confirmSwitchWorkout() {
  showSwitchModal.value = false
  workoutStore.cancelWorkout()
  workoutStore.startWorkout(pendingDayId.value)
  router.push(`/workout/${pendingDayId.value}`)
}

function resumeWorkout() {
  router.push(`/workout/${workoutStore.activeWorkoutDayId}`)
}

const activeProgram = computed(() => programStore.user_programs.find(s => s.is_active))
const expandedprogramId = ref(null)

// Rotation cursor: the active program's least-recently-performed day. Sourced
// from each day's last_performed_at (carried on the programs payload), so Home
// needs no separate history fetch.
const nextUpDayId = computed(() => {
  if (!activeProgram.value) return null
  const days = getProgramDays(activeProgram.value.id)
  if (days.length < 2 || !days.some(d => d.last_performed_at)) return null
  let best = null
  for (const day of days) {
    const lastAt = day.last_performed_at ? new Date(day.last_performed_at).getTime() : 0
    if (!best || lastAt < best.lastAt) {
      best = { day, lastAt }
    }
  }
  return best ? best.day.id : null
})

// Non-active programs computed for secondary lists
const inactiveprograms = computed(() => {
  return userprograms.value.filter(s => !s.is_active)
})

watch(activeProgram, (newActive) => {
  if (newActive) {
    expandedprogramId.value = newActive.id
  }
}, { immediate: true })

function toggleExpand(programId) {
  expandedprogramId.value = expandedprogramId.value === programId ? null : programId
}

function makeActive(programId) {
  // 1. Smooth scroll to top immediately
  const osInstance = OverlayScrollbars(document.body)
  if (osInstance) {
    osInstance.elements().viewport.scrollTo({ top: 0, behavior: 'smooth' })
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    document.documentElement.scrollTo({ top: 0, behavior: 'smooth' })
  }
  
  // 2. Delay the active status update/reorder slightly for a smoother transition
  setTimeout(() => {
    programStore.setActiveProgram(programId)
  }, 150)
}

function editProgram(programId) {
  router.push(`/builder/${programId}`)
}

// Copy a program the user owns. The store does the request and the toasts; the
// id here only disables the button that was clicked, so a double-tap on a slow
// connection can't create two copies.
const duplicatingProgramId = ref(null)

async function duplicateProgram(programId) {
  if (duplicatingProgramId.value) return
  duplicatingProgramId.value = programId

  try {
    await programStore.duplicateProgram(programId)
  } finally {
    duplicatingProgramId.value = null
  }
}

// Program file import. The store handles parsing, the request and the toasts;
// this only drives the input and the button's busy state.
const importInput = ref(null)
const importing = ref(false)

async function handleImportFile(event) {
  const file = event.target.files?.[0]
  if (!file) return

  importing.value = true
  try {
    await programStore.importProgram(file)
  } finally {
    importing.value = false
    // Clear the input so re-picking the same file fires change again.
    if (importInput.value) importInput.value.value = ''
  }
}

onMounted(() => {
  programStore.fetchPrograms()
  if (authStore.isAuthenticated && !authStore.user) {
    authStore.fetchUser()
  }
})
</script>

<template>
  <div class="dashboard">
    <!-- Welcome Header Banner -->
    <div class="welcome-banner card mb-24">
      <div class="welcome-banner-content">
        <h1 class="welcome-title">Hello, {{ authStore.user?.name || 'Athlete' }}!</h1>
        <p class="welcome-subtitle">Ready to log your training session today?</p>
      </div>
      <div class="welcome-badge" v-if="activeProgram">
        <span class="active-label">Active Program</span>
        <span class="active-name">{{ activeProgram.name }}</span>
      </div>
    </div>

    <!-- Resume In-Progress Workout Banner -->
    <div v-if="workoutStore.hasActiveSession()" class="resume-banner card mb-24">
      <div class="resume-banner-info">
        <span class="resume-label">Workout in progress</span>
        <span class="resume-details">
          {{ inProgressDay?.day_name || 'Session' }} · {{ workoutStore.activeWorkoutSets.length }}
          {{ workoutStore.activeWorkoutSets.length === 1 ? 'set' : 'sets' }} logged
        </span>
      </div>
      <PrimaryButton class="resume-btn" @click="resumeWorkout">
        <span>Resume</span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </PrimaryButton>
    </div>

    <!-- Offline workouts awaiting upload -->
    <div v-if="syncStore.pendingCount() > 0" class="sync-banner card mb-24">
      <div class="resume-banner-info">
        <span class="resume-label">Waiting to sync</span>
        <span class="resume-details">
          {{ syncStore.pendingCount() }}
          {{ syncStore.pendingCount() === 1 ? 'workout' : 'workouts' }} saved offline
        </span>
      </div>
      <button class="sync-retry-btn tap-target" :disabled="syncStore.flushing" @click="syncStore.flush()">
        {{ syncStore.flushing ? 'Syncing…' : 'Retry now' }}
      </button>
    </div>

    <!-- Loading Skeleton State — mirrors the real dashboard layout -->
    <div v-if="programStore.loading && !programStore.isListLoaded" class="dashboard-grid" aria-hidden="true">
      <!-- Left Column: Active Program showcase -->
      <div class="grid-col-left">
        <div class="section-header-compact mb-12">
          <div class="skeleton-line skeleton-pulse" style="width: 120px; height: 13px;"></div>
        </div>
        <div class="active-Program-showcase card">
          <div class="showcase-header">
            <div class="skeleton-line skeleton-pulse" style="width: 180px; height: 22px;"></div>
            <div class="skeleton-box skeleton-pulse" style="width: 36px; height: 36px; border-radius: 8px;"></div>
          </div>
          <div class="showcase-days-list mt-16">
            <div v-for="n in 4" :key="n" class="showcase-day-row">
              <div class="day-details">
                <div class="skeleton-line skeleton-pulse" style="width: 110px; height: 16px;"></div>
                <div class="skeleton-line skeleton-pulse" style="width: 70px; height: 13px;"></div>
              </div>
              <div class="skeleton-box skeleton-pulse" style="width: 84px; height: 38px; border-radius: 8px;"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Saved programs + utility cards -->
      <div class="grid-col-right">
        <div class="section-header-compact mb-12">
          <div class="skeleton-line skeleton-pulse" style="width: 130px; height: 13px;"></div>
        </div>
        <div v-for="n in 2" :key="n" class="Program-card card">
          <div class="Program-card-header">
            <div class="skeleton-line skeleton-pulse" style="width: 150px; height: 16px;"></div>
            <div class="skeleton-line skeleton-pulse" style="width: 48px; height: 13px;"></div>
          </div>
        </div>
        <div v-for="n in 2" :key="'util-' + n" class="card create-Program-card">
          <div class="create-card-content">
            <div class="skeleton-box skeleton-pulse" style="width: 42px; height: 42px; border-radius: 50%;"></div>
            <div class="create-text" style="gap: 6px;">
              <div class="skeleton-line skeleton-pulse" style="width: 160px; height: 16px;"></div>
              <div class="skeleton-line skeleton-pulse" style="width: 200px; height: 13px;"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State when no programs exist at all -->
    <div v-else-if="programStore.isListLoaded && userprograms.length === 0" class="card empty-state text-center py-40">
      <div class="empty-icon mb-16">⚡</div>
      <h3 class="subtitle" style="color: var(--text-primary);">No Workout Programs Yet</h3>
      <p class="mb-24" style="color: var(--text-secondary); max-width: 400px; margin-left: auto; margin-right: auto;">
        Create your first workout program to organize your routines and start tracking your gym progress.
      </p>
      <PrimaryButton to="/create" class="inline-flex no-underline px-24" style="justify-content: center; max-width: max-content; margin: 0 auto;">
        Create New Program
      </PrimaryButton>
    </div>

    <!-- Real Dashboard Layout Grid -->
    <div v-else class="dashboard-grid">
      <!-- Left Column: Active Program Focus -->
      <div class="grid-col-left">
        <div class="section-header-compact mb-12">
          <h2 class="section-title-small">Active Program</h2>
        </div>

        <ProgramShowcase
          v-if="activeProgram"
          :program="activeProgram"
          :days="getProgramDays(activeProgram.id)"
          :next-up-day-id="nextUpDayId"
          :duplicating-program-id="duplicatingProgramId"
          @start="startWorkout"
          @export="programStore.exportProgram"
          @duplicate="duplicateProgram"
          @edit="editProgram"
        />

        <div v-else class="card empty-active-card text-center py-24">
          <p class="mb-16" style="color: var(--text-secondary);">No Active Programs</p>
        </div>
      </div>

      <!-- Right Column: Other Programs & Utilities -->
      <div class="grid-col-right">
        <div class="section-header-compact mb-12">
          <h2 class="section-title-small">Saved Programs</h2>
        </div>

        <!-- Scrollable programs List -->
        <TransitionGroup v-if="inactiveprograms.length > 0" name="programs-reorder" tag="div" class="programs-list">
          <SavedProgramCard
            v-for="Program in inactiveprograms"
            :key="Program.id"
            :program="Program"
            :days="getProgramDays(Program.id)"
            :expanded="expandedprogramId === Program.id"
            :duplicating-program-id="duplicatingProgramId"
            @toggle="toggleExpand"
            @make-active="makeActive"
            @edit="editProgram"
            @export="programStore.exportProgram"
            @duplicate="duplicateProgram"
          />
        </TransitionGroup>

        <!-- Quick Action: Progress -->
        <router-link to="/progress" class="card create-Program-card no-underline">
          <div class="create-card-content">
            <div class="create-icon-circle">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                <polyline points="17 6 23 6 23 12"></polyline>
              </svg>
            </div>
            <div class="create-text">
              <span class="create-title-text">View Progress</span>
              <span class="create-desc-text">1RM trends, weekly volume & PRs</span>
            </div>
          </div>
        </router-link>

        <!-- Quick Action: Create Card -->
        <router-link to="/create" class="card create-Program-card no-underline">
          <div class="create-card-content">
            <div class="create-icon-circle">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </div>
            <div class="create-text">
              <span class="create-title-text">Create Workout Program</span>
              <span class="create-desc-text">Build a custom multi-day routine</span>
            </div>
          </div>
        </router-link>

        <!-- Quick Action: Import a program file. The input is visually hidden
             but focusable, so the whole card acts as its label. -->
        <label class="card create-Program-card no-underline import-Program-card" :class="{ 'is-importing': importing }">
          <div class="create-card-content">
            <div class="create-icon-circle">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
            </div>
            <div class="create-text">
              <span class="create-title-text">{{ importing ? 'Importing…' : 'Import Program' }}</span>
              <span class="create-desc-text">Load a program from a .json file</span>
            </div>
          </div>
          <input
            ref="importInput"
            class="visually-hidden"
            type="file"
            accept="application/json,.json"
            :disabled="importing"
            @change="handleImportFile"
          />
        </label>
      </div>
    </div>

    <!-- Confirm discarding the in-progress session before starting another day -->
    <AppModal
      v-model:show="showSwitchModal"
      title="Workout In Progress"
      :message="`You already have a workout in progress (${inProgressDay?.day_name || 'another day'}, ${workoutStore.activeWorkoutSets.length} sets logged). Starting a new one will discard it. Continue?`"
      confirm-text="Discard & Start New"
      cancel-text="Keep Session"
      @confirm="confirmSwitchWorkout"
    />
  </div>
</template>

<style scoped>
.resume-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border: 1px solid rgba(204, 255, 0, 0.35);
  background: linear-gradient(135deg, rgba(204, 255, 0, 0.06) 0%, var(--bg-surface) 60%);
}

.resume-banner-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.resume-label {
  font-size: 11px;
  font-weight: 800;
  color: var(--primary-accent);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.resume-details {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.resume-btn {
  height: 40px !important;
  min-height: 40px !important;
  padding: 0 18px !important;
  font-size: 14px !important;
  border-radius: 8px !important;
  display: inline-flex !important;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.sync-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border: 1px solid rgba(240, 180, 41, 0.35);
  background: linear-gradient(135deg, rgba(240, 180, 41, 0.06) 0%, var(--bg-surface) 60%);
}

.sync-banner .resume-label {
  color: #f0b429;
}

.sync-retry-btn {
  height: 40px;
  min-height: 40px;
  padding: 0 18px;
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  border-radius: 8px;
  border: 1px solid rgba(240, 180, 41, 0.45);
  background: transparent;
  color: #f0b429;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.15s ease;
}

.sync-retry-btn:hover:not(:disabled) {
  background-color: rgba(240, 180, 41, 0.1);
}

.sync-retry-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.welcome-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 30px;
  background: linear-gradient(135deg, var(--bg-surface) 0%, rgba(204, 255, 0, 0.03) 100%);
  border: 1px solid var(--border-color);
  position: relative;
  overflow: hidden;
}

.welcome-banner::after {
  content: '';
  position: absolute;
  top: -50%;
  right: -20%;
  width: 250px;
  height: 250px;
  background: radial-gradient(circle, rgba(204, 255, 0, 0.06) 0%, transparent 70%);
  pointer-events: none;
}

.welcome-title {
  font-size: 26px;
  font-weight: 800;
  margin: 0 0 6px 0;
  color: var(--text-primary);
}

.welcome-subtitle {
  font-size: 15px;
  margin: 0;
  color: var(--text-secondary);
}

.welcome-badge {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  background-color: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
  padding: 8px 16px;
  border-radius: 10px;
}

.active-label {
  font-size: 10px;
  font-weight: 800;
  color: var(--primary-accent);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 2px;
}

.active-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 1.25fr 1fr;
  gap: 24px;
}

@media (max-width: 800px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
    gap: 24px;
  }
  .welcome-banner {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
    padding: 20px;
  }
  .welcome-badge {
    align-items: flex-start;
    width: 100%;
  }
}

/* One consistent vertical rhythm for the right column. The flex gap is the
   single source of spacing, so the default .card / mb-* bottom margins are
   zeroed — this removes the oversized gap above the utility cards and, with
   the saved-programs list only rendered when non-empty, keeps the first card
   top-aligned with the active program card on the left. */
.grid-col-right {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.grid-col-right > *,
.programs-list .Program-card {
  margin-bottom: 0;
}

/* The active-program card is the last child of the left column; its default
   .card bottom margin made the greeting→active gap (24px) smaller than the
   active→saved gap (24px grid gap + 16px card margin) when stacked. Drop it so
   both gaps are an even 24px. */
.grid-col-left > .active-Program-showcase,
.grid-col-left > .empty-active-card {
  margin-bottom: 0;
}

/* Breathing room under the last utility card at the bottom of the page. */
.grid-col-right > :last-child {
  margin-bottom: 16px;
}

.section-header-compact {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 8px;
}

.section-title-small {
  font-size: 13px;
  font-weight: 800;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0;
}

/* The file input inside is visually hidden, so the label itself is the target. */
.import-Program-card {
  cursor: pointer;
  display: block;
}

.import-Program-card.is-importing {
  opacity: 0.6;
  pointer-events: none;
}

/* Surface focus on the card ONLY for keyboard focus (:focus-visible). After a
   mouse click the hidden file input keeps focus whether a file was picked or the
   dialog was cancelled, so plain :focus-within would leave the outline stuck. */
.import-Program-card:has(:focus-visible) {
  outline: 2px solid var(--primary-accent);
  outline-offset: 2px;
}

.programs-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.create-Program-card {
  border: 1px dashed var(--text-secondary);
  background: transparent;
  cursor: pointer;
  transition: all 0.25s ease;
  display: block;
  padding: 20px;
}

.create-Program-card:hover {
  border-color: var(--primary-accent);
  background-color: rgba(204, 255, 0, 0.02);
  transform: translateY(-2px);
}

.create-Program-card:active {
  transform: translateY(0);
}

.create-card-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.create-icon-circle {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1px dashed var(--text-secondary);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s ease;
  flex-shrink: 0;
}

.create-Program-card:hover .create-icon-circle {
  border-color: var(--primary-accent);
  color: var(--primary-accent);
  background-color: rgba(204, 255, 0, 0.05);
}

.create-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.create-title-text {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.create-desc-text {
  font-size: 13px;
  color: var(--text-secondary);
}

/* Skeleton animation */
.skeleton-card {
  height: 80px;
  background: var(--bg-surface);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
  overflow: hidden;
  margin-bottom: 16px;
}

/* Content-shaped skeleton primitives: a text line and a solid block. They sit
   inside the real layout cards so the loading state matches the loaded one. */
.skeleton-line,
.skeleton-box {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  flex-shrink: 0;
}

.skeleton-pulse {
  animation: pulse 1.5s infinite ease-in-out;
}

@keyframes pulse {
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
}

.programs-reorder-move {
  transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}
.programs-reorder-enter-active,
.programs-reorder-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.programs-reorder-enter-from,
.programs-reorder-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
.programs-reorder-leave-active {
  position: absolute;
  width: 100%;
}
</style>
