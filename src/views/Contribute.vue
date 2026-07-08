<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'
import { useToastStore } from '../stores/toast'
import PrimaryButton from '../components/PrimaryButton.vue'

const router = useRouter()
const toast = useToastStore()

// Form state
const exerciseName = ref('')
const targetMuscleGroup = ref('')
const mechanicsType = ref('Compound')

// UI state
const submitting = ref(false)
const recentlyAdded = ref([])

// Must match the seeded catalog taxonomy so filtering/grouping stays consistent.
const muscleGroups = [
  'Chest', 'Back', 'Legs', 'Shoulders', 'Biceps',
  'Triceps', 'Forearms', 'Core', 'Full Body'
]

const isFormValid = computed(() => {
  return exerciseName.value.trim().length >= 2 && targetMuscleGroup.value !== ''
})

async function submitExercise() {
  if (!isFormValid.value || submitting.value) return

  submitting.value = true

  try {
    const response = await api.post('/exercises', {
      name: exerciseName.value.trim(),
      target_muscle_group: targetMuscleGroup.value,
      mechanics_type: mechanicsType.value
    })

    const created = response.data.data
    recentlyAdded.value.unshift({
      id: created.id,
      name: created.name,
      target_muscle_group: created.target_muscle_group,
      mechanics_type: created.mechanics_type
    })

    toast.success(`"${created.name}" submitted! You can use it right away; it will appear for everyone once approved.`)
    exerciseName.value = ''
    targetMuscleGroup.value = ''
    mechanicsType.value = 'Compound'
  } catch {
    // Validation / server errors are surfaced as toasts by the interceptor.
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="contribute-page">
    <!-- Header with Back Button -->
    <div class="flex-row mb-24 gap-12" style="align-items: center;">
      <button class="btn-secondary back-btn tap-target" @click="router.push('/')" title="Back to Home" style="width: 32px; height: 32px; min-width: 32px; min-height: 32px; padding: 0; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <h1 class="title m-0">Contribute</h1>
    </div>

    <!-- Description banner -->
    <div class="contribute-banner card mb-24">
      <div class="banner-icon">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
      </div>
      <div class="banner-text">
        <h2 class="banner-title">Help grow the exercise library</h2>
        <p class="banner-desc">Submit exercises you know that are missing from our database. Your contributions help everyone build better workouts.</p>
      </div>
    </div>

    <!-- Form Card -->
    <div class="card contribute-form-card mb-24">
      <h3 class="form-section-title">New Exercise</h3>

      <!-- Exercise Name -->
      <div class="form-group">
        <label class="form-label" for="exercise-name">Exercise Name</label>
        <input
          id="exercise-name"
          v-model="exerciseName"
          type="text"
          class="form-input"
          placeholder="e.g. Incline Dumbbell Curl"
          maxlength="255"
          :disabled="submitting"
        />
      </div>

      <!-- Target Muscle Group -->
      <div class="form-group">
        <label class="form-label" for="muscle-group">Target Muscle Group</label>
        <select
          id="muscle-group"
          v-model="targetMuscleGroup"
          class="form-input form-select"
          :disabled="submitting"
        >
          <option value="" disabled>Select a muscle group</option>
          <option v-for="group in muscleGroups" :key="group" :value="group">{{ group }}</option>
        </select>
      </div>

      <!-- Mechanics Type -->
      <div class="form-group">
        <label class="form-label">Mechanics Type</label>
        <div class="mechanics-toggle">
          <button
            type="button"
            class="toggle-btn"
            :class="{ active: mechanicsType === 'Compound' }"
            :disabled="submitting"
            @click="mechanicsType = 'Compound'"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
            Compound
          </button>
          <button
            type="button"
            class="toggle-btn"
            :class="{ active: mechanicsType === 'Isolation' }"
            :disabled="submitting"
            @click="mechanicsType = 'Isolation'"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <circle cx="12" cy="12" r="4"></circle>
            </svg>
            Isolation
          </button>
        </div>
      </div>

      <!-- Submit Button -->
      <PrimaryButton
        @click="submitExercise"
        :disabled="!isFormValid || submitting"
        style="width: 100%; justify-content: center; margin-top: 8px;"
      >
        <span v-if="submitting" class="spinner" style="width: 18px; height: 18px; border-width: 2px; margin-right: 8px;"></span>
        {{ submitting ? 'Submitting...' : 'Submit Exercise' }}
      </PrimaryButton>
    </div>

    <!-- Recently Added Section -->
    <div v-if="recentlyAdded.length > 0" class="recently-added-section">
      <h3 class="form-section-title" style="margin-bottom: 16px;">Recently Added</h3>
      <TransitionGroup name="list-fade" tag="div" class="recently-added-list">
        <div v-for="ex in recentlyAdded" :key="ex.id" class="card recently-added-card">
          <div class="ra-info">
            <span class="ra-name">{{ ex.name }}</span>
            <div class="ra-tags">
              <span class="ra-tag">{{ ex.target_muscle_group }}</span>
              <span class="ra-tag-sep">•</span>
              <span class="ra-tag">{{ ex.mechanics_type }}</span>
            </div>
          </div>
          <div class="ra-check-icon">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </div>
      </TransitionGroup>
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

/* Banner */
.contribute-banner {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 20px 24px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  border-left: 3px solid var(--primary-accent);
}

.banner-icon {
  flex-shrink: 0;
  color: var(--primary-accent);
  margin-top: 2px;
}

.banner-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 6px 0;
}

.banner-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
}

/* Form Card */
.contribute-form-card {
  padding: 24px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
}

.form-section-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 20px 0;
  letter-spacing: 0.2px;
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  background-color: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
  font-weight: 500;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  outline: none;
}

.form-input::placeholder {
  color: rgba(170, 170, 170, 0.5);
}

.form-input:focus {
  border-color: var(--primary-accent);
  box-shadow: 0 0 0 2px rgba(204, 255, 0, 0.08);
}

.form-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-select {
  appearance: none;
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23AAAAAA' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 16px center;
  padding-right: 44px;
}

.form-select option {
  background-color: #1a1a1a;
  color: var(--text-primary);
  padding: 8px;
}

/* Mechanics Toggle */
.mechanics-toggle {
  display: flex;
  gap: 8px;
}

.toggle-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background-color: rgba(0, 0, 0, 0.15);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toggle-btn:hover:not(:disabled) {
  border-color: var(--text-secondary);
  background-color: rgba(255, 255, 255, 0.03);
}

.toggle-btn.active {
  border-color: var(--primary-accent);
  color: var(--primary-accent);
  background-color: rgba(204, 255, 0, 0.06);
}

.toggle-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Recently Added */
.recently-added-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.recently-added-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
}

.ra-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ra-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.ra-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}

.ra-tag {
  background-color: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
  padding: 2px 6px;
  border-radius: 4px;
}

.ra-tag-sep {
  color: var(--border-color);
}

.ra-check-icon {
  color: var(--success);
  flex-shrink: 0;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
