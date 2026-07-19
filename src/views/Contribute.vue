<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../api'
import { useToastStore } from '../stores/toast'
import PrimaryButton from '../components/PrimaryButton.vue'
import BackButton from '../components/BackButton.vue'
import PendingLabel from '../components/PendingLabel.vue'
import { MEASUREMENT_OPTIONS, WEIGHTED, measurementLabel } from '../utils/measurement'

const toast = useToastStore()

// Form state
const exerciseName = ref('')
const targetMuscleGroup = ref('')
const mechanicsType = ref('Compound')
const measurementType = ref(WEIGHTED)

// Spell out what the selected type means — the choice decides which inputs the
// workout screen shows, which isn't obvious from the label alone.
const measurementHint = computed(
  () => MEASUREMENT_OPTIONS.find(o => o.value === measurementType.value)?.hint || ''
)

// UI state
const submitting = ref(false)

// "My exercises" list — the contributor's own submissions across every status,
// server-paginated and searchable.
const myExercises = ref([])
const myPage = ref(1)
const myLastPage = ref(1)
const myPerPage = ref(15)
const myLoading = ref(false)
const mySearch = ref('')
const myStatus = ref('')

// Must match the seeded catalog taxonomy so filtering/grouping stays consistent.
const muscleGroups = [
  'Chest', 'Back', 'Legs', 'Shoulders', 'Biceps',
  'Triceps', 'Forearms', 'Core', 'Full Body'
]

const statusMeta = {
  approved: { label: 'Approved', cls: 'status-approved' },
  pending: { label: 'Pending', cls: 'status-pending' },
  rejected: { label: 'Rejected', cls: 'status-rejected' }
}

const isFormValid = computed(() => {
  return exerciseName.value.trim().length >= 2 && targetMuscleGroup.value !== ''
})

async function fetchMine(page = 1) {
  myLoading.value = true
  try {
    const response = await api.get('/exercises/mine', {
      params: {
        page,
        search: mySearch.value || undefined,
        status: myStatus.value || undefined
      }
    })
    myExercises.value = response.data.data
    const meta = response.data.meta
    myPage.value = meta?.current_page || 1
    myLastPage.value = meta?.last_page || 1
    myPerPage.value = meta?.per_page || 15
  } catch (e) {
    console.error('Failed to fetch your exercises:', e)
  } finally {
    myLoading.value = false
  }
}

// Debounce the search so we don't fire a request per keystroke.
let searchTimer = null
function onSearchInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => fetchMine(1), 350)
}

function goToPage(page) {
  if (page < 1 || page > myLastPage.value) return
  fetchMine(page)
}

onMounted(() => fetchMine(1))

async function submitExercise() {
  if (!isFormValid.value || submitting.value) return

  submitting.value = true

  try {
    const response = await api.post('/exercises', {
      name: exerciseName.value.trim(),
      target_muscle_group: targetMuscleGroup.value,
      mechanics_type: mechanicsType.value,
      measurement_type: measurementType.value
    })

    const created = response.data.data

    toast.success(`"${created.name}" submitted for review. You can use it right away; it'll appear for everyone once an admin approves it.`)
    exerciseName.value = ''
    targetMuscleGroup.value = ''
    mechanicsType.value = 'Compound'
    measurementType.value = WEIGHTED

    // Surface the new pending submission at the top of "My exercises".
    mySearch.value = ''
    fetchMine(1)
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
      <BackButton />
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

      <!-- Measurement Type — decides which inputs the workout screen shows -->
      <div class="form-group">
        <label class="form-label" for="measurement-type">How is it measured?</label>
        <select
          id="measurement-type"
          v-model="measurementType"
          class="form-input form-select"
          :disabled="submitting"
        >
          <option v-for="option in MEASUREMENT_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <p class="form-hint">{{ measurementHint }}</p>
      </div>

      <!-- Submit Button -->
      <PrimaryButton
        @click="submitExercise"
        :disabled="!isFormValid || submitting"
        style="width: 100%; justify-content: center; margin-top: 8px;"
      >
        <span v-if="submitting" class="spinner" style="width: 18px; height: 18px; border-width: 2px; margin-right: 8px;"></span>
        <PendingLabel v-if="submitting" text="Submitting" />
        <template v-else>Submit Exercise</template>
      </PrimaryButton>
    </div>

    <!-- My Exercises Section -->
    <div class="my-exercises-section">
      <h3 class="form-section-title" style="margin-bottom: 16px;">My Exercises</h3>

      <!-- Filters -->
      <div class="my-filters">
        <div class="form-group my-filter-search">
          <label class="form-label" for="my-search">Search</label>
          <input
            id="my-search"
            v-model="mySearch"
            type="text"
            class="form-input"
            placeholder="Search your submissions..."
            @input="onSearchInput"
          />
        </div>
        <div class="form-group my-filter-status">
          <label class="form-label" for="my-status">Status</label>
          <select id="my-status" v-model="myStatus" class="form-input form-select" @change="fetchMine(1)">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      <!-- Loading skeleton (mirrors the table) -->
      <div v-if="myLoading && myExercises.length === 0" class="table-scroll card">
        <table class="my-table">
          <thead>
            <tr>
              <th class="th-num">#</th>
              <th>Name</th>
              <th>Muscle Group</th>
              <th>Mechanics</th>
              <th>Measured</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="n in 4" :key="n">
              <td class="td-num"><span class="sk-bar sk-bar-num"></span></td>
              <td><span class="sk-bar" style="width: 80%;"></span></td>
              <td><span class="sk-bar" style="width: 60%;"></span></td>
              <td><span class="sk-bar" style="width: 55%;"></span></td>
              <td><span class="sk-bar" style="width: 50%;"></span></td>
              <td><span class="sk-bar sk-bar-pill"></span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Empty -->
      <div v-else-if="myExercises.length === 0" class="card empty-state">
        <p class="empty-text">You haven't contributed any exercises yet.</p>
      </div>

      <!-- Table -->
      <div v-else class="table-scroll card">
        <table class="my-table">
          <thead>
            <tr>
              <th class="th-num">#</th>
              <th>Name</th>
              <th>Muscle Group</th>
              <th>Mechanics</th>
              <th>Measured</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(ex, index) in myExercises" :key="ex.id">
              <td class="td-num">{{ (myPage - 1) * myPerPage + index + 1 }}</td>
              <td class="td-name">
                <span class="name-inner">
                  {{ ex.name }}
                  <span v-if="ex.status === 'rejected' && ex.rejection_reason" class="my-reject-reason">
                    Reason: {{ ex.rejection_reason }}
                  </span>
                </span>
              </td>
              <td>{{ ex.target_muscle_group }}</td>
              <td>{{ ex.mechanics_type }}</td>
              <td>{{ measurementLabel(ex.measurement_type) }}</td>
              <td>
                <span class="status-pill" :class="statusMeta[ex.status]?.cls">
                  {{ statusMeta[ex.status]?.label || ex.status }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="myLastPage > 1" class="pagination">
        <button class="page-btn" :disabled="myPage <= 1" @click="goToPage(myPage - 1)">Prev</button>
        <span class="page-info">Page {{ myPage }} of {{ myLastPage }}</span>
        <button class="page-btn" :disabled="myPage >= myLastPage" @click="goToPage(myPage + 1)">Next</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
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

/* Explains what the selected measurement type means for logging. */
.form-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
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

/* My Exercises filters */
.my-filters {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.my-filter-search {
  flex: 1;
}

.my-filter-status {
  width: 150px;
  flex-shrink: 0;
}

/* My Exercises table */
.table-scroll {
  padding: 0;
  overflow-x: auto;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  margin-bottom: 0;
}

.th-num,
.td-num {
  width: 44px;
  text-align: right;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  /* Never break the row number across lines (e.g. "10"). */
  white-space: nowrap;
}

.my-table {
  width: 100%;
  /* Auto layout keeps the other columns naturally sized; the Name column is
     constrained on its own via .name-inner so it wraps the same as the admin
     tables. min-width triggers horizontal scroll on narrow screens. */
  min-width: 480px;
  border-collapse: collapse;
  font-size: 13px;
}

.my-table th {
  text-align: left;
  /* Side padding matches the body cells so headers line up over their columns. */
  padding: 12px 12px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
  white-space: nowrap;
}

.my-table td {
  padding: 12px 12px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
  vertical-align: middle;
  /* Long values wrap between words so the table fits big screens without
     horizontal scroll; narrow screens still scroll via the table's min-width. */
  overflow-wrap: break-word;
}

.my-table tbody tr:last-child td {
  border-bottom: none;
}

.my-table tbody tr:hover {
  background-color: rgba(255, 255, 255, 0.02);
}

.td-name {
  color: var(--text-primary);
  font-weight: 700;
}

/* Fixed-width inner box so the name wraps at the same width as the admin
   tables, independent of how wide auto-layout makes the column. */
.name-inner {
  display: inline-block;
  width: 170px;
}

.my-reject-reason {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-secondary);
  font-style: italic;
  font-weight: 400;
}

/* Status pill */
.status-pill {
  display: inline-block;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.status-approved {
  background-color: rgba(204, 255, 0, 0.1);
  color: var(--primary-accent);
  border: 1px solid rgba(204, 255, 0, 0.2);
}

.status-pending {
  background-color: rgba(255, 200, 0, 0.1);
  color: #ffca3a;
  border: 1px solid rgba(255, 200, 0, 0.25);
}

.status-rejected {
  background-color: rgba(255, 80, 80, 0.1);
  color: #ff6b6b;
  border: 1px solid rgba(255, 80, 80, 0.25);
}

/* Empty + skeleton */
.empty-state {
  padding: 28px 20px;
  text-align: center;
  border: 1px dashed var(--border-color);
  background: var(--bg-surface);
  margin-bottom: 0;
}

.empty-text {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

/* Skeleton shimmer bars — sized to mirror the real cell content. */
.sk-bar {
  display: inline-block;
  width: 70%;
  height: 12px;
  border-radius: 4px;
  background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
  vertical-align: middle;
}

.sk-bar-num {
  width: 16px;
}

.sk-bar-pill {
  width: 62px;
  height: 18px;
  border-radius: 999px;
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .sk-bar { animation: none; }
}

/* Pagination */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 16px;
}

.page-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background-color: rgba(0, 0, 0, 0.15);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s ease;
}

.page-btn:hover:not(:disabled) {
  border-color: var(--text-secondary);
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  font-size: 13px;
  color: var(--text-secondary);
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
