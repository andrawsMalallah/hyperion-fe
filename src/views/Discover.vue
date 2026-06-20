<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDiscoverStore } from '../stores/discover'
import AppModal from '../components/AppModal.vue'

const router = useRouter()
const discoverStore = useDiscoverStore()

const searchQuery = computed({
  get: () => discoverStore.searchQuery,
  set: (val) => { discoverStore.searchQuery = val }
})
const programs = computed(() => discoverStore.discoverPrograms)
const loading = computed(() => discoverStore.discoverLoading)
const hasMore = computed(() => discoverStore.discoverHasMore)
const selectedProgram = ref(null)
const loaderRef = ref(null)
let observer = null

let searchTimeout = null

async function fetchPrograms(reset = false, isScroll = false) {
  await discoverStore.fetchDiscoverPrograms(reset, isScroll)
}

function onSearchInput() {
  clearTimeout(searchTimeout)
  const query = searchQuery.value.trim()
  if (query.length > 0 && query.length < 2) {
    return
  }
  searchTimeout = setTimeout(() => {
    fetchPrograms(true, false)
  }, 1500)
}

function clearSearch() {
  searchQuery.value = ''
  fetchPrograms(true, false)
}

function getTotalExercises(Program) {
  if (!Program.days) return 0
  return Program.days.reduce((acc, day) => acc + (day.exercises?.length || 0), 0)
}

function openModal(Program) {
  selectedProgram.value = Program
}

function closeModal() {
  selectedProgram.value = null
}

watch(selectedProgram, (newVal) => {
  if (newVal) {
    document.documentElement.classList.add('modal-open')
    document.body.classList.add('modal-open')
  } else {
    document.documentElement.classList.remove('modal-open')
    document.body.classList.remove('modal-open')
  }
})

function setupObserver() {
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !loading.value && hasMore.value) {
      fetchPrograms(false, true)
    }
  }, { rootMargin: '100px' })

  if (loaderRef.value) {
    observer.observe(loaderRef.value)
  }
}

onMounted(async () => {
  await fetchPrograms(false, false)
  setupObserver()
})

onUnmounted(() => {
  if (observer) {
    observer.disconnect()
  }
  document.documentElement.classList.remove('modal-open')
  document.body.classList.remove('modal-open')
})
</script>

<template>
  <div class="discover-page">
    <!-- Header with Back Button -->
    <div class="flex-row mb-24 gap-12" style="align-items: center;">
      <button class="btn-secondary back-btn tap-target" @click="router.push('/')" title="Back to Home" style="width: 36px; height: 36px; min-width: 36px; min-height: 36px; padding: 0; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <h1 class="title m-0">Discover Programs</h1>
    </div>

    <!-- Search Bar (Premium, clean design) -->
    <div class="search-container mb-24">
      <div class="search-input-wrapper">
        <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input 
          v-model="searchQuery" 
          @input="onSearchInput"
          type="text" 
          placeholder="Search public programs, routines, or exercises..." 
          class="input-large search-bar-input"
        />
        <button v-if="searchQuery" @click="clearSearch" class="clear-search-btn" title="Clear search">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>

    <!-- Loading Skeleton (Initial Load) -->
    <div v-if="loading && programs.length === 0" class="programs-grid">
      <div v-for="n in 6" :key="n" class="card discover-Program-card skeleton-pulse" style="min-height: 120px;">
        <div class="Program-card-header pb-12" style="border-bottom: 1px solid var(--border-color); width: 100%;">
          <div class="Program-title-container" style="width: 70%;">
            <div class="skeleton-bar title-bar" style="width: 80%; height: 18px; margin-bottom: 8px;"></div>
            <div class="skeleton-bar text-bar" style="width: 40%; height: 12px;"></div>
          </div>
          <div class="skeleton-circle-btn" style="width: 32px; height: 32px; border-radius: 50%;"></div>
        </div>
        <div class="Program-summary-info mt-12" style="display: flex; gap: 8px;">
          <div class="skeleton-bar text-bar" style="width: 50px; height: 14px;"></div>
          <span class="summary-dot">•</span>
          <div class="skeleton-bar text-bar" style="width: 60px; height: 14px;"></div>
        </div>
      </div>
    </div>

    <!-- programs Grid List -->
    <TransitionGroup name="list-fade" tag="div" class="programs-grid" v-else-if="programs.length > 0">
      <div v-for="Program in programs" :key="Program.id" class="card discover-Program-card">
        <div class="Program-card-header">
          <div class="Program-title-container">
            <h3 class="Program-title m-0">{{ Program.name }}</h3>
            <span class="Program-creator" v-if="Program.user?.name">by {{ Program.user.name }}</span>
          </div>
          <button class="eye-btn tap-target" @click="openModal(Program)" title="View Details">
            <svg class="eye-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
        </div>
        
        <div class="Program-divider"></div>
        
        <div class="Program-summary-info">
          <span class="summary-item">
            <strong>{{ Program.days?.length || 0 }}</strong> {{ (Program.days?.length === 1) ? 'Day' : 'Days' }}
          </span>
          <span class="summary-dot">•</span>
          <span class="summary-item">
            <strong>{{ getTotalExercises(Program) }}</strong> {{ (getTotalExercises(Program) === 1) ? 'Exercise' : 'Exercises' }}
          </span>
        </div>
      </div>
    </TransitionGroup>

    <!-- Empty State -->
    <div v-else-if="!loading" class="card empty-state py-40 text-center">
      <p style="color: var(--text-secondary); margin: 0;">No matching programs found. Try adjusting your search query.</p>
    </div>

    <!-- Loading Spinner / Footer -->
    <div class="footer-loader" ref="loaderRef" style="display: flex; justify-content: center; align-items: center; min-height: 45px; box-sizing: border-box; margin-top: 16px;">
      <div v-if="loading && programs.length > 0" class="spinner" style="width: 24px; height: 24px; border-width: 3px;"></div>
      <div v-else-if="!hasMore && programs.length > 0" class="end-message" style="margin: 0;">
        No more data to display
      </div>
    </div>

    <!-- Detail Modal (Premium Overlay) -->
    <AppModal 
      v-model:show="selectedProgram"
      type="custom"
      maxWidth="500px"
      @cancel="closeModal"
    >
      <template #header>
        <div class="modal-title-box">
          <h2 class="subtitle m-0 text-accent" style="font-weight: 800; font-size: 20px; line-height: 1.2;">{{ selectedProgram.name }}</h2>
          <span class="modal-creator-tag" v-if="selectedProgram.user?.name">Created by {{ selectedProgram.user.name }}</span>
        </div>
      </template>

      <div v-for="day in selectedProgram.days" :key="day.id" class="modal-day-section">
        <h3 class="modal-day-title">{{ day.day_name }}</h3>
        
        <ul v-if="day.exercises && day.exercises.length > 0" class="modal-exercises-list">
          <li v-for="exercise in day.exercises" :key="exercise.id" class="modal-exercise-item">
            <div class="modal-exercise-name">{{ exercise.name }}</div>
            <div class="modal-exercise-meta" v-if="exercise.target_muscle_group || exercise.mechanics_type">
              <span class="meta-tag">{{ exercise.target_muscle_group }}</span>
              <span class="meta-separator" v-if="exercise.target_muscle_group && exercise.mechanics_type">•</span>
              <span class="meta-tag">{{ exercise.mechanics_type }}</span>
            </div>
          </li>
        </ul>
        <div v-else class="modal-empty-exercises">
          No exercises added to this day.
        </div>
      </div>
      
      <div v-if="selectedProgram.days?.length === 0" class="modal-empty-days">
        No days added to this program yet.
      </div>
    </AppModal>
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

.search-container {
  width: 100%;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.search-icon {
  position: absolute;
  left: 16px;
  color: var(--text-secondary);
  pointer-events: none;
}

.search-bar-input {
  width: 100%;
  padding-left: 48px;
  padding-right: 48px;
  border-radius: 10px;
}

.clear-search-btn {
  position: absolute;
  right: 12px;
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background-color: rgba(255, 255, 255, 0.02);
  transition: all 0.15s ease;
}

.clear-search-btn:hover {
  color: var(--primary-accent);
  border-color: var(--primary-accent);
  background-color: var(--bg-surface-hover);
}

.programs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}

.discover-Program-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  background-color: var(--bg-surface);
  padding: 20px;
  transition: all 0.25s ease;
}

.discover-Program-card:hover {
  transform: translateY(-2px);
  border-color: var(--primary-accent);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}

.Program-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  width: 100%;
}

.Program-title-container {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 80%;
}

.Program-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.Program-creator {
  font-size: 12px;
  color: var(--text-secondary);
}

.eye-btn {
  width: 32px;
  height: 32px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.eye-btn:hover {
  color: var(--primary-accent);
  border-color: var(--primary-accent);
  background-color: var(--bg-surface-hover);
  transform: scale(1.05);
}

.eye-btn:active {
  transform: scale(0.98);
}

.Program-divider {
  height: 1px;
  background-color: var(--border-color);
  margin: 16px 0;
}

.Program-summary-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 13px;
}

.summary-dot {
  color: var(--border-color);
}

/* Modal style refinements */

.modal-day-section {
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border-color);
}

.modal-day-section:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.modal-day-title {
  font-size: 15px;
  font-weight: 700;
  margin-top: 0;
  margin-bottom: 12px;
  color: var(--primary-accent);
}

.modal-exercises-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.modal-exercise-item {
  background-color: rgba(0, 0, 0, 0.15);
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.modal-exercise-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.modal-exercise-meta {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.meta-tag {
  background-color: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
  padding: 2px 6px;
  border-radius: 4px;
}

.meta-separator {
  color: var(--border-color);
}

.modal-empty-exercises,
.modal-empty-days {
  color: var(--text-secondary);
  font-size: 13px;
  font-style: italic;
  padding: 4px 0;
}
</style>
