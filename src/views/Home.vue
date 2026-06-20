<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProgramStore } from '../stores/program'
import { useWorkoutStore } from '../stores/workout'
import { useAuthStore } from '../stores/auth'
import PrimaryButton from '../components/PrimaryButton.vue'

import { OverlayScrollbars } from 'overlayscrollbars'

const router = useRouter()
const programStore = useProgramStore()
const workoutStore = useWorkoutStore()
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

function startWorkout(dayId) {
  workoutStore.startWorkout(dayId)
  router.push(`/workout/${dayId}`)
}

function getExerciseCount(day) {
  return day.exercises.length
}

const activeProgram = computed(() => programStore.user_programs.find(s => s.is_active))
const expandedprogramId = ref(null)

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

// Transition hooks to animate element height dynamically
function beforeEnter(el) {
  el.style.height = '0'
  el.style.opacity = '0'
  el.style.transform = 'translateY(-8px)'
  el.style.overflow = 'hidden'
}

function enter(el, done) {
  el.offsetHeight // force reflow
  el.style.transition = 'height 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s ease, transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
  el.style.height = el.scrollHeight + 'px'
  el.style.opacity = '1'
  el.style.transform = 'translateY(0)'
  el.addEventListener('transitionend', done, { once: true })
}

function afterEnter(el) {
  el.style.height = 'auto'
  el.style.overflow = ''
  el.style.transition = ''
}

function beforeLeave(el) {
  el.style.height = el.scrollHeight + 'px'
  el.style.overflow = 'hidden'
  el.offsetHeight // force reflow
}

function leave(el, done) {
  el.style.transition = 'height 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.25s ease, transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
  el.style.height = '0'
  el.style.opacity = '0'
  el.style.transform = 'translateY(-8px)'
  el.addEventListener('transitionend', done, { once: true })
}

onMounted(() => {
  programStore.fetchprograms()
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

    <!-- Loading Skeleton State -->
    <div v-if="programStore.loading && !programStore.isListLoaded" class="dashboard-grid">
      <div class="grid-col-left">
        <div class="skeleton-card skeleton-pulse" style="height: 280px; margin-bottom: 24px;"></div>
      </div>
      <div class="grid-col-right">
        <div class="skeleton-card skeleton-pulse" style="height: 140px; margin-bottom: 24px;"></div>
        <div class="skeleton-card skeleton-pulse" style="height: 100px;"></div>
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

        <div v-if="activeProgram" class="active-Program-showcase card">
          <div class="showcase-header">
            <h3 class="showcase-title">{{ activeProgram.name }}</h3>
            <button class="btn-secondary tap-target edit-shortcut-btn" @click="editProgram(activeProgram.id)" title="Edit Program">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
          </div>

          <div class="showcase-days-list mt-16">
            <div v-for="day in getProgramDays(activeProgram.id)" :key="day.id" class="showcase-day-row">
              <div class="day-details">
                <span class="showcase-day-name">{{ day.day_name }}</span>
                <span class="showcase-day-exercises">{{ getExerciseCount(day) }} exercises</span>
              </div>
              <PrimaryButton class="showcase-start-btn" @click="startWorkout(day.id)">
                <span>Start</span>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </PrimaryButton>
            </div>
            
            <div v-if="getProgramDays(activeProgram.id).length === 0" class="empty-state text-center py-16" style="border: 1px dashed var(--border-color); border-radius: 8px;">
              No days added to this program yet. Click edit shortcut to build it.
            </div>
          </div>
        </div>

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
        <TransitionGroup name="programs-reorder" tag="div" class="programs-list mb-24">
          <div 
            v-for="Program in inactiveprograms" 
            :key="Program.id" 
            class="Program-card card" 
            :class="{ 'is-expanded': expandedprogramId === Program.id }" 
            @click="toggleExpand(Program.id)"
          >
            <div class="Program-card-header">
              <h3 class="Program-title">{{ Program.name }}</h3>
              <span class="expand-hint">{{ getProgramDays(Program.id).length }} days</span>
            </div>
            
            <Transition
              name="Program-expand"
              @before-enter="beforeEnter"
              @enter="enter"
              @after-enter="afterEnter"
              @before-leave="beforeLeave"
              @leave="leave"
            >
              <div v-if="expandedprogramId === Program.id" class="days-list" @click.stop>
                <div v-for="(day, idx) in getProgramDays(Program.id)" :key="day.id" class="day-row" :style="{ transitionDelay: idx * 40 + 'ms' }">
                  <div class="day-info">
                    <span class="day-name">{{ day.day_name }}</span>
                    <span class="day-exercises">{{ getExerciseCount(day) }} exercises</span>
                  </div>
                </div>
                
                <div v-if="getProgramDays(Program.id).length === 0" class="empty-state empty-days-hint py-8 text-center" style="border: 1px dashed var(--border-color); border-radius: 8px; font-size: 13px;">
                  No days added yet.
                </div>
                
                <div class="flex-row gap-12 mt-16">
                  <PrimaryButton class="px-16 h-36" style="font-size: 13px;" @click="makeActive(Program.id)">Make Active</PrimaryButton>
                  <button class="btn-secondary tap-target px-16 h-36" style="font-size: 13px;" @click="editProgram(Program.id)">Edit</button>
                </div>
              </div>
            </Transition>
          </div>
        </TransitionGroup>

        <!-- Quick Action: Create Card -->
        <router-link to="/create" class="card create-Program-card no-underline mb-24">
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
      </div>
    </div>
  </div>
</template>

<style scoped>
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
  grid-template-columns: 1.6fr 1fr;
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

.active-Program-showcase {
  border: 1px solid var(--border-color);
  padding: 24px;
}

.showcase-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.showcase-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  color: var(--primary-accent);
}

.edit-shortcut-btn {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  min-height: 36px !important;
  border-radius: 8px !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center;
  justify-content: center;
}

.showcase-days-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.showcase-day-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-color);
  padding: 14px 18px;
  border-radius: 10px;
  transition: all 0.2s ease;
}

.showcase-day-row:hover {
  background-color: rgba(255, 255, 255, 0.04);
  border-color: #444;
}

.day-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.showcase-day-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.showcase-day-exercises {
  font-size: 13px;
  color: var(--text-secondary);
}

.showcase-start-btn {
  height: 38px !important;
  min-height: 38px !important;
  padding: 0 16px !important;
  font-size: 14px !important;
  border-radius: 8px !important;
  display: inline-flex !important;
  align-items: center;
  gap: 6px;
}

.showcase-start-btn svg {
  transition: transform 0.2s ease;
}

.showcase-start-btn:hover svg {
  transform: translateX(2px);
}

.programs-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.Program-card {
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  padding: 16px;
}

.Program-card:hover {
  border-color: #555;
  background-color: rgba(255, 255, 255, 0.01);
}

.Program-card.is-expanded {
  background-color: rgba(255, 255, 255, 0.015);
  border-color: #444;
}

.Program-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.Program-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.expand-hint {
  font-size: 13px;
  color: var(--text-secondary);
}

.days-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.day-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.15);
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.day-info {
  display: flex;
  flex-direction: column;
}

.day-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.day-exercises {
  font-size: 12px;
  color: var(--text-secondary);
}

.h-36 {
  height: 36px !important;
  min-height: 36px !important;
}

.px-16 {
  padding-left: 16px !important;
  padding-right: 16px !important;
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
