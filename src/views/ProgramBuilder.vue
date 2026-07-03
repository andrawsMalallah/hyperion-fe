<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useExerciseStore } from '../stores/exercise'
import { useProgramStore } from '../stores/program'
import ExerciseSelectionModal from '../components/ExerciseSelectionModal.vue'
import AppModal from '../components/AppModal.vue'
import PrimaryButton from '../components/PrimaryButton.vue'

const router = useRouter()
const route = useRoute()
const exerciseStore = useExerciseStore()
const programStore = useProgramStore()

const pageLoading = ref(true)

const targetProgram = computed(() => {
  if (route.params.programId === 'new') {
    return programStore.draftProgram
  }
  if (route.params.programId) {
    return programStore.user_programs.find(s => String(s.id) === String(route.params.programId))
  }
  return programStore.user_programs.find(s => s.is_active)
})

// Local Draft State
const draftDays = ref([])
const draftProgramName = ref('')
const isDirty = ref(false)
const isSaving = ref(false)
const isDeleting = ref(false)
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

const initializeDraft = () => {
  if (targetProgram.value) {
    draftProgramName.value = targetProgram.value.name
    if (route.params.programId === 'new') {
      draftDays.value = JSON.parse(JSON.stringify(targetProgram.value.days || []))
    } else {
      draftDays.value = JSON.parse(JSON.stringify(
        programStore.program_days.filter(d => String(d.program_id) === String(targetProgram.value.id))
      ))
    }
  }
}

onMounted(async () => {
  pageLoading.value = true
  if (route.params.programId && route.params.programId !== 'new') {
    await programStore.fetchSingleProgram(route.params.programId)
  }
  initializeDraft()
  pageLoading.value = false
})

// Route Guard Logic
const showLeaveModal = ref(false)
let leavePromiseResolve = null

onBeforeRouteLeave((to, from) => {
  if (isDirty.value) {
    showLeaveModal.value = true
    return new Promise((resolve) => {
      leavePromiseResolve = resolve
    })
  }
})

const handleLeaveConfirm = () => {
  isDirty.value = false
  if (leavePromiseResolve) leavePromiseResolve(true)
}

const handleLeaveCancel = () => {
  if (leavePromiseResolve) leavePromiseResolve(false)
}

// Reactive local days based on draft
const localDays = computed(() => {
  return draftDays.value
    .sort((a, b) => a.display_order - b.display_order)
    .map(d => ({
      ...d,
      exerciseObjects: d.exercises.map(exId => exerciseStore.exercises.find(e => e.id === exId)).filter(e => e)
    }))
})

// Up/Down reordering
const moveUp = (day, index) => {
  if (index > 0) {
    const d = draftDays.value.find(draft => draft.id === day.id)
    if (d) {
      const item = d.exercises.splice(index, 1)[0]
      d.exercises.splice(index - 1, 0, item)
      isDirty.value = true
    }
  }
}

const moveDown = (day, index) => {
  if (index < day.exercises.length - 1) {
    const d = draftDays.value.find(draft => draft.id === day.id)
    if (d) {
      const item = d.exercises.splice(index, 1)[0]
      d.exercises.splice(index + 1, 0, item)
      isDirty.value = true
    }
  }
}

const removeExercise = (day, element) => {
  const d = draftDays.value.find(draft => draft.id === day.id)
  if (d) {
    d.exercises = d.exercises.filter(id => id !== element.id)
    isDirty.value = true
  }
}

// Exercise Modal state
const showExerciseModal = ref(false)
const selectedDayForModal = ref(null)

const openModal = (dayId) => {
  selectedDayForModal.value = dayId
  showExerciseModal.value = true
}

const handleAddExercises = (exerciseIds) => {
  const d = draftDays.value.find(draft => draft.id === selectedDayForModal.value)
  if (d && exerciseIds.length > 0) {
    d.exercises = [...d.exercises, ...exerciseIds]
    isDirty.value = true
  }
}

// Prescription (target sets / reps / rest) editing per exercise
const expandedRx = ref(new Set())

const rxKey = (dayId, exId) => `${dayId}:${exId}`

function toggleRx(day, exId) {
  const d = draftDays.value.find(draft => draft.id === day.id)
  if (!d) return
  if (!d.prescriptions) d.prescriptions = {}
  if (!d.prescriptions[exId]) d.prescriptions[exId] = {}
  const key = rxKey(day.id, exId)
  const next = new Set(expandedRx.value)
  next.has(key) ? next.delete(key) : next.add(key)
  expandedRx.value = next
}

function rxSummary(day, exId) {
  const rx = day.prescriptions?.[exId]
  if (!rx) return ''
  const parts = []
  if (rx.target_sets) {
    let reps = ''
    if (rx.rep_range_min && rx.rep_range_max) reps = `×${rx.rep_range_min}-${rx.rep_range_max}`
    else if (rx.rep_range_min) reps = `×${rx.rep_range_min}+`
    parts.push(`${rx.target_sets}${reps}`)
  } else if (rx.rep_range_min && rx.rep_range_max) {
    parts.push(`${rx.rep_range_min}-${rx.rep_range_max} reps`)
  }
  if (rx.target_rpe) parts.push(`@${rx.target_rpe}`)
  if (rx.rest_seconds) parts.push(`${rx.rest_seconds}s rest`)
  return parts.join(' · ')
}

// Dialog States
const showAddDayModal = ref(false)
const showSaveSuccessModal = ref(false)
const showDeleteDayModal = ref(false)
const showDeleteProgramModal = ref(false)
const dayToDelete = ref(null)

const defaultAddDayName = computed(() => "Day " + (draftDays.value.length + 1))

const promptAddDay = () => showAddDayModal.value = true

const deleteProgramModalTitle = computed(() => {
  return route.params.programId === 'new' ? 'Discard Draft' : 'Delete Program'
})

const deleteProgramModalMessage = computed(() => {
  return route.params.programId === 'new'
    ? 'Are you sure you want to discard this program draft? This action cannot be undone.'
    : 'Are you sure you want to delete this entire program? This action cannot be undone.'
})

const deleteProgramConfirmText = computed(() => {
  return route.params.programId === 'new' ? 'Discard Draft' : 'Delete Program'
})

const handleAddDayConfirm = (name) => {
  if (name) {
    const newOrder = draftDays.value.length > 0 ? Math.max(...draftDays.value.map(d => d.display_order)) + 1 : 1
    draftDays.value.push({
      id: 'day-draft-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      program_id: targetProgram.value.id,
      day_name: name,
      display_order: newOrder,
      exercises: []
    })
    isDirty.value = true
  }
}

const deleteDay = (dayId) => {
  dayToDelete.value = dayId
  showDeleteDayModal.value = true
}

const handleDeleteDayConfirm = () => {
  if (dayToDelete.value) {
    draftDays.value = draftDays.value.filter(d => d.id !== dayToDelete.value)
    isDirty.value = true
    dayToDelete.value = null
  }
}

const saveProgram = async () => {
  if (targetProgram.value) {
    isSaving.value = true
    errorMsg.value = ''
    validationErrors.value = {}
    try {
      if (route.params.programId === 'new') {
        const newId = await programStore.saveNewProgram({
          name: draftProgramName.value.trim() || 'Custom Program',
          days: draftDays.value
        })
        if (newId) {
          router.replace(`/builder/${newId}`)
        }
      } else {
        if (draftProgramName.value && draftProgramName.value.trim() !== '' && draftProgramName.value !== targetProgram.value.name) {
          programStore.renameProgram(targetProgram.value.id, draftProgramName.value.trim())
        }
        await programStore.syncProgramDays(targetProgram.value.id, draftDays.value)
      }
      isDirty.value = false
      showSaveSuccessModal.value = true
    } catch (error) {
      if (error.response && error.response.status === 422) {
        validationErrors.value = error.response.data.errors || {}
      } else if (error.response && error.response.data && error.response.data.message) {
        errorMsg.value = error.response.data.message
      } else {
        errorMsg.value = 'Failed to save program. Please try again.'
      }
    } finally {
      isSaving.value = false
    }
  }
}

const handleGoHome = () => {
  router.push('/')
}

const deleteProgram = () => {
  showDeleteProgramModal.value = true
}

const handleDeleteProgramConfirm = async () => {
  isDirty.value = false // Prevent leave guard
  isDeleting.value = true
  try {
    if (route.params.programId === 'new') {
      programStore.draftProgram = null
    } else {
      await programStore.deleteProgram(targetProgram.value.id)
    }
    router.push('/')
  } catch (error) {
    isDeleting.value = false
    console.error('Failed to delete program:', error)
  }
}

const getMuscleGroupColor = (group) => {
  const colors = {
    Chest: '#ff6b6b',
    Back: '#45b7d1',
    Shoulders: '#f9ca24',
    Biceps: '#ff9ff3',
    Triceps: '#feca57',
    Forearms: '#1dd1a1',
    Quadriceps: '#a55eea',
    Hamstrings: '#26de81',
    Glutes: '#fd9644',
    Calves: '#00d2d3',
    Abdominals: '#2bcbba',
    Traps: '#eb3b5a',
    Lats: '#3867d6',
    'Full Body': '#8854d0',
    Legs: '#4ecdc4'
  }
  return colors[group] || '#AAAAAA'
}
</script>

<template>
  <div class="program-builder">
    <Transition name="page-fade" mode="out-in">
      <!-- Loading Skeleton State -->
      <div v-if="pageLoading" class="builder-skeleton" key="skeleton">
        <div class="skeleton-header skeleton-pulse"></div>
        <div class="skeleton-days">
          <div v-for="n in 2" :key="n" class="skeleton-day-card card skeleton-pulse">
            <div class="skeleton-day-header">
              <div class="skeleton-bar title-bar"></div>
              <div class="skeleton-circle-btn"></div>
            </div>
            <div class="skeleton-exercise-list">
              <div v-for="ex in 2" :key="ex" class="skeleton-exercise-item">
                <div class="skeleton-bar text-bar"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="builder-content-wrapper" v-else-if="targetProgram" key="content">
        <div class="header-row">
          <input 
            class="program-name-input" 
            v-model="draftProgramName" 
            @input="isDirty = true" 
            placeholder="Program Name" 
          />
        </div>

        <div class="builder-container">
          <!-- Program Days Area -->
          <TransitionGroup name="list-fade" tag="div" class="days-panel">
            <div v-for="day in localDays" :key="day.id" class="card day-card">
              <div class="day-header">
                <h2 class="subtitle m-0">{{ day.day_name }}</h2>
                <div class="day-actions gap-8">
                  <button 
                    class="btn-secondary day-action-btn" 
                    @click="openModal(day.id)" 
                    title="Add Exercise"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                  </button>
                  <button 
                    class="btn-secondary day-action-btn delete-day-btn" 
                    @click="deleteDay(day.id)" 
                    title="Delete Day"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              </div>

              <TransitionGroup name="list-fade" tag="div" class="day-list">
                <div v-for="(element, index) in day.exerciseObjects" :key="element.id + '-' + index"
                  class="exercise-item list-item">
                  <div class="order-controls">
                    <button 
                      class="icon-btn" 
                      :disabled="index === 0" 
                      @click="moveUp(day, index)"
                      title="Move Up"
                    >
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="18 15 12 9 6 15"></polyline>
                      </svg>
                    </button>
                    <button 
                      class="icon-btn" 
                      :disabled="index === day.exerciseObjects.length - 1"
                      @click="moveDown(day, index)"
                      title="Move Down"
                    >
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </button>
                  </div>
                  <div class="ex-name">
                    {{ element.name }}
                    <span v-if="rxSummary(day, element.id)" class="rx-summary">{{ rxSummary(day, element.id) }}</span>
                  </div>
                  <div class="ex-badge" :style="{ backgroundColor: getMuscleGroupColor(element.target_muscle_group) }">
                    {{ element.target_muscle_group }}
                  </div>
                  <button
                    class="btn-secondary tap-target rx-toggle-btn"
                    :class="{ 'rx-toggle-btn--active': expandedRx.has(rxKey(day.id, element.id)) }"
                    @click="toggleRx(day, element.id)"
                    title="Set targets (sets / reps / rest)"
                    aria-label="Edit prescription"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line>
                      <line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line>
                      <line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line>
                      <line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line>
                      <line x1="17" y1="16" x2="23" y2="16"></line>
                    </svg>
                  </button>
                  <button
                    class="btn-danger tap-target remove-btn"
                    @click="removeExercise(day, element)"
                    title="Remove Exercise"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>

                  <div v-if="expandedRx.has(rxKey(day.id, element.id)) && day.prescriptions?.[element.id]" class="rx-editor">
                    <label class="rx-field">
                      <span>Sets</span>
                      <input type="number" min="1" max="20" v-model.number="day.prescriptions[element.id].target_sets" @input="isDirty = true" placeholder="3" />
                    </label>
                    <label class="rx-field">
                      <span>Reps min</span>
                      <input type="number" min="1" max="100" v-model.number="day.prescriptions[element.id].rep_range_min" @input="isDirty = true" placeholder="8" />
                    </label>
                    <label class="rx-field">
                      <span>Reps max</span>
                      <input type="number" min="1" max="100" v-model.number="day.prescriptions[element.id].rep_range_max" @input="isDirty = true" placeholder="12" />
                    </label>
                    <label class="rx-field">
                      <span>RPE</span>
                      <input type="number" min="1" max="10" v-model.number="day.prescriptions[element.id].target_rpe" @input="isDirty = true" placeholder="–" />
                    </label>
                    <label class="rx-field">
                      <span>Rest (s)</span>
                      <input type="number" min="0" max="600" step="15" v-model.number="day.prescriptions[element.id].rest_seconds" @input="isDirty = true" placeholder="90" />
                    </label>
                  </div>
                </div>

                <div v-if="day.exerciseObjects.length === 0" key="empty" class="empty-state">
                  No exercises added. Click "+ Add Exercise" to start.
                </div>
              </TransitionGroup>
            </div>

          </TransitionGroup>

          <!-- Error Alert -->
          <div v-if="errorList.length > 0" class="error-msg" style="margin-top: 16px; margin-bottom: -8px;">
            <ul style="margin: 0; padding-left: 20px;">
              <li v-for="(err, index) in errorList" :key="index">{{ err }}</li>
            </ul>
          </div>

          <!-- Builder Actions — all three buttons together -->
          <div class="builder-actions" style="margin-top: -12px;">
            <button class="builder-delete-btn" @click="deleteProgram" :disabled="isDeleting || isSaving" :title="route.params.programId === 'new' ? 'Discard Draft' : 'Delete Program'">
              <div v-if="isDeleting" class="spinner button-spinner"></div>
              <svg v-else viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              {{ isDeleting ? (route.params.programId === 'new' ? 'Discarding...' : 'Deleting...') : (route.params.programId === 'new' ? 'Discard' : 'Delete') }}
            </button>

            <div class="builder-actions-divider"></div>

            <button class="builder-add-day-btn" @click="promptAddDay">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Add Day
            </button>

            <button class="builder-save-btn" @click="saveProgram" :disabled="!isDirty || isSaving" :class="{ 'builder-save-btn--active': isDirty }">
              <div v-if="isSaving" class="spinner button-spinner"></div>
              <svg v-else viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
              {{ isSaving ? 'Saving...' : (isDirty ? 'Save' : 'Saved') }}
            </button>
          </div>
        </div>
      </div>

      <div v-else-if="!route.params.programId || route.params.programId === 'new'" class="empty-state" key="empty">
        <p>No active program or draft found. Please select or create one.</p>
        <div style="display: flex; gap: 12px; justify-content: center; margin-top: 16px;">
          <router-link to="/" class="btn-secondary tap-target inline-flex no-underline">Go to Home</router-link>
          <PrimaryButton to="/create" class="inline-flex no-underline">Create Program</PrimaryButton>
        </div>
      </div>
    </Transition>

    <!-- Modals -->
    <ExerciseSelectionModal 
      v-model:show="showExerciseModal" 
      :dayId="selectedDayForModal" 
      @add="handleAddExercises" 
    />

    <AppModal 
      v-model:show="showLeaveModal" 
      title="Unsaved Changes" 
      message="You have unsaved changes. Are you sure you want to leave?" 
      type="confirm" 
      confirm-text="Leave" 
      cancel-text="Stay"
      @confirm="handleLeaveConfirm" 
      @cancel="handleLeaveCancel"
    />

    <AppModal 
      v-model:show="showAddDayModal" 
      title="Add New Day" 
      message="Enter a name for the new day:" 
      type="prompt" 
      :default-value="defaultAddDayName" 
      confirm-text="Add" 
      @confirm="handleAddDayConfirm" 
    />

    <AppModal 
      v-model:show="showDeleteDayModal" 
      title="Delete Day" 
      message="Are you sure you want to delete this day? This action cannot be undone." 
      type="confirm" 
      confirm-text="Delete" 
      @confirm="handleDeleteDayConfirm" 
    />

    <AppModal 
      v-model:show="showDeleteProgramModal" 
      :title="deleteProgramModalTitle" 
      :message="deleteProgramModalMessage" 
      type="confirm" 
      :confirm-text="deleteProgramConfirmText" 
      @confirm="handleDeleteProgramConfirm" 
    />

    <AppModal 
      v-model:show="showSaveSuccessModal" 
      title="Program Saved" 
      message="Your program changes have been saved successfully. Would you like to stay or return home?" 
      type="confirm" 
      confirm-text="Go Home" 
      cancel-text="Stay"
      @confirm="handleGoHome" 
    />

  </div>
</template>

<style scoped>
.exercise-item {
  flex-wrap: wrap;
}

.rx-summary {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: var(--primary-accent);
  margin-top: 2px;
}

.rx-toggle-btn {
  width: 32px;
  height: 32px;
  min-width: 32px;
  min-height: 32px;
  padding: 0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.rx-toggle-btn--active {
  color: var(--primary-accent);
  border-color: var(--primary-accent);
}

.rx-editor {
  flex-basis: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
  padding: 12px;
  background-color: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.rx-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 70px;
  min-width: 64px;
}

.rx-field span {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

.rx-field input {
  width: 100%;
  background-color: var(--bg-main);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 8px;
  font-size: 14px;
  font-weight: 600;
}

.rx-field input:focus {
  outline: none;
  border-color: var(--primary-accent);
}
</style>
