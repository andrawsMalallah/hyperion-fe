<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useDiscoverStore } from '../stores/discover'
import { useToastStore } from '../stores/toast'
import { useAuthStore } from '../stores/auth'
import AppModal from '../components/AppModal.vue'
import BackButton from '../components/BackButton.vue'
import { useDebouncedSearch } from '../composables/useDebouncedSearch'

const discoverStore = useDiscoverStore()
const toast = useToastStore()
const authStore = useAuthStore()

// You can't "save" a program you already own — hide the clone action on your
// own programs (the backend rejects it too, as a second layer).
const isOwnProgram = computed(
  () => !!(selectedProgram.value && authStore.user && selectedProgram.value.user?.id === authStore.user.id)
)

const searchQuery = computed({
  get: () => discoverStore.searchQuery,
  set: (val) => { discoverStore.searchQuery = val }
})
const programs = computed(() => discoverStore.discoverPrograms)
const loading = computed(() => discoverStore.discoverLoading)
const hasMore = computed(() => discoverStore.discoverHasMore)
const selectedProgram = ref(null)
const cloning = ref(false)
const loaderRef = ref(null)
let observer = null

async function fetchPrograms(reset = false, isScroll = false) {
  await discoverStore.fetchDiscoverPrograms(reset, isScroll)
}

const { onSearchInput, cancel: cancelSearch } = useDebouncedSearch(
  () => searchQuery.value,
  () => fetchPrograms(true, false)
)

function clearSearch() {
  // Clearing searches now, so drop the keystroke's pending one — otherwise it
  // fires a second, identical fetch 350ms later.
  cancelSearch()
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

async function handleClone() {
  if (!selectedProgram.value || cloning.value) return
  cloning.value = true
  try {
    await discoverStore.cloneProgram(selectedProgram.value.id)
    toast.success('Saved to your programs')
    closeModal()
  } catch (e) {
    // Failure is already surfaced by the api interceptor; keep the modal open
    // so the user can retry.
  } finally {
    cloning.value = false
  }
}

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
  // The pending search timer is useDebouncedSearch's to cancel on unmount.
  // A leftover query would silently filter the next visit's results.
  discoverStore.searchQuery = ''
  // The detail modal's scroll lock is AppModal's to release (useModalLock),
  // not this view's — it unmounts with the page.
})
</script>

<template>
  <div class="discover-page">
    <!-- Header with Back Button -->
    <div class="flex-row mb-24 gap-12" style="align-items: center;">
      <BackButton />
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
            <svg class="eye-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
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
      :show="!!selectedProgram"
      type="custom"
      maxWidth="500px"
      maxHeight="75vh"
      @cancel="closeModal"
    >
      <template #header>
        <div class="modal-header-row">
          <div class="modal-title-box">
            <h2 class="subtitle m-0 text-accent" style="font-weight: 800; font-size: 20px; line-height: 1.2;">{{ selectedProgram.name }}</h2>
            <span class="modal-creator-tag" v-if="selectedProgram.user?.name">Created by {{ selectedProgram.user.name }}</span>
          </div>
          <template v-if="!isOwnProgram">
            <button
              v-if="!selectedProgram.already_saved"
              class="save-icon-btn"
              :disabled="cloning"
              :title="cloning ? 'Saving…' : 'Save to my programs'"
              @click="handleClone"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
            <span v-else class="saved-icon" title="Saved to your programs">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
          </template>
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
.programs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  column-gap: 18px;
  row-gap: 4px;
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
  width: 34px;
  height: 34px;
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

/* Save / saved action lives in the modal header, beside the close button.
   The header row spans the full width so the icon can push to the right. */
.modal-header-row {
  display: flex;
  flex: 1;
  align-items: flex-start;
  gap: 12px;
}

.save-icon-btn,
.saved-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  margin-left: auto;
  margin-right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}

/* Match the close button's icon size (32×32 box, 14px glyph). */
.save-icon-btn svg,
.saved-icon svg {
  width: 14px;
  height: 14px;
}

.save-icon-btn {
  border: 1px solid var(--primary-accent);
  background: transparent;
  color: var(--primary-accent);
  cursor: pointer;
  transition: all 0.2s ease;
}

.save-icon-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

/* Guard the hover fill so it doesn't stick after a tap on touch devices. */
@media (hover: hover) {
  .save-icon-btn:hover:not(:disabled) {
    background: var(--primary-accent);
    color: var(--bg-main);
  }
}

.saved-icon {
  border: 1px solid var(--primary-accent);
  color: var(--primary-accent);
}
</style>
