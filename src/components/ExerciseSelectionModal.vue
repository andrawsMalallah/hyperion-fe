<script setup>
import { ref, computed, watch } from 'vue'
import { useExerciseStore } from '../stores/exercise'
import PrimaryButton from './PrimaryButton.vue'
import { muscleGroupColor } from '../utils/muscleColors'
import { useFocusTrap } from '../composables/useFocusTrap'
import { useModalLock } from '../composables/useModalLock'

const props = defineProps({
  show: Boolean,
  dayId: [String, Number]
})

const emit = defineEmits(['update:show', 'add'])

const exerciseStore = useExerciseStore()
const selectedExercises = ref(new Set())
const modalRef = ref(null)
const titleId = 'exercise-picker-title'

const searchQuery = computed({
  get: () => exerciseStore.searchQuery,
  set: (val) => { exerciseStore.searchQuery = val }
})

const visibleExercises = computed(() => {
  return exerciseStore.catalog
})

const getMuscleGroupColor = muscleGroupColor

const toggleExerciseSelection = (exId) => {
  const newSet = new Set(selectedExercises.value)
  if (newSet.has(exId)) {
    newSet.delete(exId)
  } else {
    newSet.add(exId)
  }
  selectedExercises.value = newSet
}

const isSelected = (exId) => selectedExercises.value.has(exId)

const addSelectedExercises = () => {
  if (selectedExercises.value.size > 0) {
    emit('add', Array.from(selectedExercises.value))
  }
  closeModal()
}

const closeModal = () => {
  emit('update:show', false)
  selectedExercises.value = new Set()
  if (searchQuery.value !== '') {
    searchQuery.value = ''
    exerciseStore.reset()
  }
}

function handleScroll(e) {
  if (exerciseStore.loading || !exerciseStore.exerciseHasMore) return

  const container = e.target
  const scrollHeight = container.scrollHeight
  const scrollTop = container.scrollTop
  const clientHeight = container.clientHeight

  if (scrollHeight - scrollTop - clientHeight < 50) {
    exerciseStore.fetchExercises(false, true)
  }
}

let searchTimeout = null
function onSearchInput() {
  clearTimeout(searchTimeout)
  const query = searchQuery.value.trim()
  if (query.length > 0 && query.length < 2) {
    return
  }
  searchTimeout = setTimeout(() => {
    exerciseStore.fetchExercises(true, false)
  }, 350)
}

const clearSearch = () => {
  searchQuery.value = ''
  onSearchInput()
}

useFocusTrap(() => props.show, modalRef, {
  onEscape: () => closeModal()
})

useModalLock(() => props.show)

watch(() => props.show, async (newVal) => {
  if (newVal) await exerciseStore.fetchExercises(false, false)
})
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="show" class="modal-overlay" @click.self="closeModal">
      <div
        ref="modalRef"
        class="modal-content card"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
      >
        <div class="modal-header">
          <h2 :id="titleId" class="subtitle">Select Exercises</h2>
          <button class="close-modal-btn" @click="closeModal" title="Close" aria-label="Close dialog">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="search-input-wrapper mb-16">
          <svg class="search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input 
            v-model="searchQuery" 
            @input="onSearchInput"
            class="input-large search-bar-input" 
            placeholder="Search exercises..." 
          />
          <button v-if="searchQuery" @click="clearSearch" class="clear-search-btn" title="Clear search">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="modal-exercise-list" @scroll="handleScroll">
          <Transition name="page-fade" mode="out-in">
            <div v-if="exerciseStore.loading && !exerciseStore.isLoaded" key="loading" class="skeleton-list" style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
              <div v-for="n in 5" :key="n" class="exercise-item skeleton-pulse" style="border: 1px solid var(--border-color); background: rgba(255, 255, 255, 0.01); display: flex; align-items: center; padding: 12px 16px; border-radius: 8px;">
                <div class="skeleton-checkbox" style="width: 18px; height: 18px; border-radius: 4px; background: rgba(255, 255, 255, 0.05); margin-right: 16px;"></div>
                <div class="skeleton-bar" style="width: 45%; height: 14px; border-radius: 4px; background: rgba(255, 255, 255, 0.05); flex-grow: 0;"></div>
                <div style="flex-grow: 1;"></div>
                <div class="skeleton-badge" style="width: 70px; height: 20px; border-radius: 6px; background: rgba(255, 255, 255, 0.05);"></div>
              </div>
            </div>
            <div v-else key="content">
              <TransitionGroup name="list-fade" tag="div">
                <div v-for="element in visibleExercises" :key="element.id" class="exercise-item selectable-item"
                  :class="{ 'selected': isSelected(element.id) }" @click="toggleExerciseSelection(element.id)">
                  <!-- The row's click handler is a convenience; the checkbox is what
                       keyboard users reach, so the name has to live on it too. -->
                  <input type="checkbox" :checked="isSelected(element.id)" class="exercise-checkbox"
                    :aria-label="element.name"
                    @click.stop="toggleExerciseSelection(element.id)" />
                  <div class="ex-name">{{ element.name }}</div>
                  <div class="ex-badge" :style="{ backgroundColor: getMuscleGroupColor(element.target_muscle_group) }">
                    {{ element.target_muscle_group }}
                  </div>
                </div>
              </TransitionGroup>
              <div v-if="!exerciseStore.loading && visibleExercises.length === 0" class="empty-state">
                No exercises found.
              </div>
              <!-- Bottom Loader Spacer -->
              <div class="py-12 text-center" style="display: flex; justify-content: center; align-items: center; min-height: 35px; box-sizing: border-box;">
                <div v-if="exerciseStore.loading" class="spinner" style="width: 24px; height: 24px; border-width: 3px;"></div>
                <div v-else-if="!exerciseStore.exerciseHasMore && visibleExercises.length > 0" style="font-size: 12px; color: var(--text-secondary);">
                  No more data to display
                </div>
              </div>
            </div>
          </Transition>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary tap-target px-4" style="padding: 0 24px;" @click="closeModal">Cancel</button>
          <PrimaryButton @click="addSelectedExercises"
            :disabled="selectedExercises.size === 0">
            Add Selected ({{ selectedExercises.size }})
          </PrimaryButton>
        </div>
      </div>
    </div>
  </Transition>
</template>
