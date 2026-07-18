<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAdminStore } from '../stores/admin'
import BackButton from '../components/BackButton.vue'
import PrimaryButton from '../components/PrimaryButton.vue'
import AppModal from '../components/AppModal.vue'
import { measurementLabel } from '../utils/measurement'

const admin = useAdminStore()

// Must match the Contribute form + seeded catalog taxonomy.
const muscleGroups = [
  'Chest', 'Back', 'Legs', 'Shoulders', 'Biceps',
  'Triceps', 'Forearms', 'Core', 'Full Body'
]

// Per-row busy state so a click only disables the row being acted on.
const actingId = ref(null)

// Reject modal state
const showRejectModal = ref(false)
const rejectTarget = ref(null)
const rejectReason = ref('')

// A human label for the active contributor filter (set when the admin clicks a
// contributor name). The store only holds the id.
const contributorFilterName = ref('')

const hasActiveFilters = computed(() =>
  !!(admin.filters.status || admin.filters.target_muscle_group || admin.filters.search || admin.filters.created_by)
)

onMounted(() => {
  admin.fetchPending(1)
  admin.fetchExercises(1)
})

async function approve(exercise) {
  actingId.value = exercise.id
  try {
    await admin.approveExercise(exercise.id)
  } catch {
    // interceptor toasts
  } finally {
    actingId.value = null
  }
}

function openReject(exercise) {
  rejectTarget.value = exercise
  rejectReason.value = ''
  showRejectModal.value = true
}

async function confirmReject() {
  if (!rejectTarget.value) return
  const exercise = rejectTarget.value
  actingId.value = exercise.id
  showRejectModal.value = false
  try {
    await admin.rejectExercise(exercise.id, rejectReason.value.trim())
  } catch {
    // interceptor toasts
  } finally {
    actingId.value = null
    rejectTarget.value = null
  }
}

// --- All-exercises filters ---
function applyFilters() {
  admin.fetchExercises(1)
}

function filterByContributor(contributor) {
  if (!contributor) return
  admin.filters.created_by = contributor.id
  contributorFilterName.value = contributor.name
  admin.fetchExercises(1)
}

function clearFilters() {
  admin.resetFilters()
  contributorFilterName.value = ''
  admin.fetchExercises(1)
}

function goToPendingPage(page) {
  if (page < 1 || page > admin.pendingLastPage) return
  admin.fetchPending(page)
}

function goToExercisesPage(page) {
  if (page < 1 || page > admin.exercisesLastPage) return
  admin.fetchExercises(page)
}

// Debounce the name-search input so we don't fire a request per keystroke.
let searchTimer = null
function onSearchInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => admin.fetchExercises(1), 350)
}

const statusMeta = {
  approved: { label: 'Approved', cls: 'status-approved' },
  pending: { label: 'Pending', cls: 'status-pending' },
  rejected: { label: 'Rejected', cls: 'status-rejected' }
}
</script>

<template>
  <div class="admin-page">
    <!-- Header -->
    <div class="flex-row mb-24 gap-12" style="align-items: center;">
      <BackButton />
      <h1 class="title m-0">Admin</h1>
    </div>

    <!-- ===================== Pending requests ===================== -->
    <section class="admin-section mb-24">
      <div class="section-head">
        <h2 class="section-title">Pending requests</h2>
        <span class="count-badge">{{ admin.pendingTotal }}</span>
      </div>

      <!-- Loading skeleton (mirrors the pending table) -->
      <div v-if="admin.pendingLoading && admin.pending.length === 0" class="table-scroll card">
        <table class="admin-table">
          <thead>
            <tr>
              <th class="th-num">#</th>
              <th>Name</th>
              <th>Muscle Group</th>
              <th>Mechanics</th>
              <th>Measured</th>
              <th>Contributor</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="n in 4" :key="n">
              <td class="td-num"><span class="sk-bar sk-bar-num"></span></td>
              <td><span class="sk-bar" style="width: 80%;"></span></td>
              <td><span class="sk-bar" style="width: 60%;"></span></td>
              <td><span class="sk-bar" style="width: 55%;"></span></td>
              <td><span class="sk-bar" style="width: 50%;"></span></td>
              <td><span class="sk-bar" style="width: 70%;"></span></td>
              <td>
                <div class="row-actions">
                  <span class="sk-bar sk-bar-btn"></span>
                  <span class="sk-bar sk-bar-btn"></span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Empty state -->
      <div v-else-if="admin.pending.length === 0" class="card empty-state">
        <p class="empty-text">No pending contributions. You're all caught up.</p>
      </div>

      <!-- Pending table -->
      <div v-else class="table-scroll card">
        <table class="admin-table">
          <thead>
            <tr>
              <th class="th-num">#</th>
              <th>Name</th>
              <th>Muscle Group</th>
              <th>Mechanics</th>
              <th>Measured</th>
              <th>Contributor</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(exercise, index) in admin.pending" :key="exercise.id">
              <td class="td-num">{{ (admin.pendingPage - 1) * admin.pendingPerPage + index + 1 }}</td>
              <td class="td-name"><span class="name-inner">{{ exercise.name }}</span></td>
              <td>{{ exercise.target_muscle_group }}</td>
              <td>{{ exercise.mechanics_type }}</td>
              <td>{{ measurementLabel(exercise.measurement_type) }}</td>
              <td class="td-muted">{{ exercise.contributor ? exercise.contributor.name : '—' }}</td>
              <td>
                <div class="row-actions">
                  <button
                    class="btn-approve"
                    :disabled="actingId === exercise.id"
                    @click="approve(exercise)"
                  >
                    Approve
                  </button>
                  <button
                    class="btn-reject"
                    :disabled="actingId === exercise.id"
                    @click="openReject(exercise)"
                  >
                    Reject
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pending pagination -->
      <div v-if="admin.pendingLastPage > 1" class="pagination">
        <button class="page-btn" :disabled="admin.pendingPage <= 1" @click="goToPendingPage(admin.pendingPage - 1)">Prev</button>
        <span class="page-info">Page {{ admin.pendingPage }} of {{ admin.pendingLastPage }}</span>
        <button class="page-btn" :disabled="admin.pendingPage >= admin.pendingLastPage" @click="goToPendingPage(admin.pendingPage + 1)">Next</button>
      </div>
    </section>

    <!-- ===================== All exercises ===================== -->
    <section class="admin-section">
      <div class="section-head">
        <h2 class="section-title">All exercises</h2>
        <span class="count-badge">{{ admin.exercisesTotal }}</span>
      </div>

      <!-- Filters -->
      <div class="card filters-card">
        <div class="filters-grid">
          <div class="filter-group">
            <label class="filter-label" for="filter-status">Status</label>
            <select id="filter-status" v-model="admin.filters.status" class="filter-input filter-select" @change="applyFilters">
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div class="filter-group">
            <label class="filter-label" for="filter-muscle">Muscle group</label>
            <select id="filter-muscle" v-model="admin.filters.target_muscle_group" class="filter-input filter-select" @change="applyFilters">
              <option value="">All groups</option>
              <option v-for="group in muscleGroups" :key="group" :value="group">{{ group }}</option>
            </select>
          </div>

          <div class="filter-group filter-search">
            <label class="filter-label" for="filter-search">Search name</label>
            <input
              id="filter-search"
              v-model="admin.filters.search"
              type="text"
              class="filter-input"
              placeholder="Exercise name..."
              @input="onSearchInput"
            />
          </div>
        </div>

        <!-- Active-filter chips -->
        <div v-if="hasActiveFilters" class="active-filters">
          <span v-if="contributorFilterName" class="filter-chip">
            Contributor: {{ contributorFilterName }}
          </span>
          <button class="clear-filters-btn" @click="clearFilters">Clear filters</button>
        </div>
      </div>

      <!-- Loading skeleton (mirrors the all-exercises table) -->
      <div v-if="admin.exercisesLoading && admin.exercises.length === 0" class="table-scroll card" style="margin-top: 16px;">
        <table class="admin-table">
          <thead>
            <tr>
              <th class="th-num">#</th>
              <th>Name</th>
              <th>Muscle Group</th>
              <th>Mechanics</th>
              <th>Measured</th>
              <th>Contributor</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="n in 6" :key="n">
              <td class="td-num"><span class="sk-bar sk-bar-num"></span></td>
              <td><span class="sk-bar" style="width: 80%;"></span></td>
              <td><span class="sk-bar" style="width: 60%;"></span></td>
              <td><span class="sk-bar" style="width: 55%;"></span></td>
              <td><span class="sk-bar" style="width: 50%;"></span></td>
              <td><span class="sk-bar" style="width: 70%;"></span></td>
              <td><span class="sk-bar sk-bar-pill"></span></td>
              <td><span class="sk-bar sk-bar-btn"></span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Empty state -->
      <div v-else-if="admin.exercises.length === 0" class="card empty-state" style="margin-top: 16px;">
        <p class="empty-text">No exercises match these filters.</p>
      </div>

      <!-- Exercise table -->
      <div v-else class="table-scroll card" style="margin-top: 16px;">
        <table class="admin-table">
          <thead>
            <tr>
              <th class="th-num">#</th>
              <th>Name</th>
              <th>Muscle Group</th>
              <th>Mechanics</th>
              <th>Measured</th>
              <th>Contributor</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(exercise, index) in admin.exercises" :key="exercise.id">
              <td class="td-num">{{ (admin.exercisesPage - 1) * admin.exercisesPerPage + index + 1 }}</td>
              <td class="td-name">
                <span class="name-inner">
                  {{ exercise.name }}
                  <span v-if="exercise.status === 'rejected' && exercise.rejection_reason" class="reject-reason">
                    Reason: {{ exercise.rejection_reason }}
                  </span>
                </span>
              </td>
              <td>{{ exercise.target_muscle_group }}</td>
              <td>{{ exercise.mechanics_type }}</td>
              <td>{{ measurementLabel(exercise.measurement_type) }}</td>
              <td>
                <button
                  v-if="exercise.contributor"
                  class="tag-contributor-btn"
                  title="Filter by this contributor"
                  @click="filterByContributor(exercise.contributor)"
                >
                  {{ exercise.contributor.name }}
                </button>
                <span v-else class="td-muted">—</span>
              </td>
              <td>
                <span class="status-pill" :class="statusMeta[exercise.status]?.cls">
                  {{ statusMeta[exercise.status]?.label || exercise.status }}
                </span>
              </td>
              <td>
                <!-- Quick approve for a pending row straight from this list. -->
                <button
                  v-if="exercise.status === 'pending'"
                  class="btn-approve btn-approve-sm"
                  :disabled="actingId === exercise.id"
                  @click="approve(exercise)"
                >
                  Approve
                </button>
                <span v-else class="td-muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- All-exercises pagination -->
      <div v-if="admin.exercisesLastPage > 1" class="pagination">
        <button class="page-btn" :disabled="admin.exercisesPage <= 1" @click="goToExercisesPage(admin.exercisesPage - 1)">Prev</button>
        <span class="page-info">Page {{ admin.exercisesPage }} of {{ admin.exercisesLastPage }}</span>
        <button class="page-btn" :disabled="admin.exercisesPage >= admin.exercisesLastPage" @click="goToExercisesPage(admin.exercisesPage + 1)">Next</button>
      </div>
    </section>

    <!-- Reject reason modal -->
    <AppModal
      v-model:show="showRejectModal"
      title="Reject exercise"
      :message="rejectTarget ? `Reject &quot;${rejectTarget.name}&quot;? The contributor will be emailed. A reason is optional.` : ''"
      confirmText="Reject Exercise"
      cancelText="Cancel"
      @confirm="confirmReject"
    >
      <div class="reject-field">
        <label class="filter-label" for="reject-reason">Reason (optional)</label>
        <textarea
          id="reject-reason"
          v-model="rejectReason"
          class="filter-input reject-textarea"
          rows="3"
          maxlength="500"
          placeholder="e.g. Duplicate of an existing exercise"
        ></textarea>
      </div>
    </AppModal>
  </div>
</template>

<style scoped>
.admin-section {
  margin-bottom: 24px;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.count-badge {
  background-color: rgba(204, 255, 0, 0.1);
  color: var(--primary-accent);
  font-size: 12px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid rgba(204, 255, 0, 0.2);
}

/* Table */
.table-scroll {
  padding: 0;
  overflow-x: auto;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  margin-bottom: 0;
}

.admin-table {
  width: 100%;
  /* Auto layout keeps the other columns naturally sized; the Name column is
     constrained on its own via .name-inner so it wraps the same in every table.
     min-width forces horizontal scroll (via .table-scroll) on narrow screens. */
  min-width: 640px;
  border-collapse: collapse;
  font-size: 13px;
}

.admin-table th {
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

.th-num,
.td-num {
  width: 44px;
  text-align: right;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  /* Never break the row number across lines (e.g. "10"). */
  white-space: nowrap;
}

.admin-table td {
  padding: 12px 12px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
  vertical-align: middle;
  /* Long values wrap between words so the table fits big screens without
     horizontal scroll; narrow screens still scroll via the table's min-width.
     break-word (not anywhere) so columns keep their natural width instead of
     collapsing to a single character. */
  overflow-wrap: break-word;
}

.admin-table tbody tr:last-child td {
  border-bottom: none;
}

.admin-table tbody tr:hover {
  background-color: rgba(255, 255, 255, 0.02);
}

.td-name {
  color: var(--text-primary);
  font-weight: 700;
}

/* Fixed-width inner box so the name wraps at exactly the same width in every
   table, independent of how wide auto-layout makes the column. */
.name-inner {
  display: inline-block;
  width: 170px;
}

.td-muted {
  color: var(--text-secondary);
}

.reject-reason {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-secondary);
  font-style: italic;
  font-weight: 400;
}

.tag-contributor-btn {
  background: none;
  border: none;
  padding: 0;
  color: var(--primary-accent);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* Actions — kept on one line, left-aligned under the "Actions" header. */
.row-actions {
  display: flex;
  gap: 8px;
}

.btn-approve,
.btn-reject {
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  font-family: inherit;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.btn-approve {
  background-color: rgba(204, 255, 0, 0.1);
  border-color: rgba(204, 255, 0, 0.3);
  color: var(--primary-accent);
}

.btn-approve:hover:not(:disabled) {
  background-color: rgba(204, 255, 0, 0.18);
}

.btn-approve-sm {
  padding: 4px 10px;
  font-size: 11px;
}

.btn-reject {
  background-color: rgba(255, 80, 80, 0.08);
  border-color: rgba(255, 80, 80, 0.3);
  color: #ff6b6b;
}

.btn-reject:hover:not(:disabled) {
  background-color: rgba(255, 80, 80, 0.16);
}

.btn-approve:disabled,
.btn-reject:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

/* Filters */
.filters-card {
  padding: 18px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  margin-bottom: 0;
}

.filters-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.filter-search {
  grid-column: 1 / -1;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.filter-input {
  width: 100%;
  padding: 10px 14px;
  background-color: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s ease;
}

.filter-input:focus {
  border-color: var(--primary-accent);
}

.filter-select {
  appearance: none;
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23AAAAAA' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  padding-right: 40px;
}

.filter-select option {
  background-color: #1a1a1a;
  color: var(--text-primary);
}

.active-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.filter-chip {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  background-color: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  padding: 4px 10px;
  border-radius: 999px;
}

.clear-filters-btn {
  background: none;
  border: none;
  color: var(--primary-accent);
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
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

.sk-bar-btn {
  width: 60px;
  height: 24px;
  border-radius: 6px;
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .sk-bar { animation: none; }
}

/* Reject modal field */
.reject-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.reject-textarea {
  resize: vertical;
  min-height: 72px;
  line-height: 1.5;
}
</style>
