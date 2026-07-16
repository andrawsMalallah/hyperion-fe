import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'
import { useToastStore } from './toast'

// Backs the admin exercise-approval dashboard: the pending-review queue and the
// full, filterable exercise list. Both are server-paginated. Nothing here is
// persisted — the dashboard refetches on mount, so admin actions always reflect
// live state.
export const useAdminStore = defineStore('admin', () => {
  // Pending queue
  const pending = ref([])
  const pendingPage = ref(1)
  const pendingLastPage = ref(1)
  const pendingPerPage = ref(30)
  const pendingTotal = ref(0)
  const pendingLoading = ref(false)

  // All exercises (with filters)
  const exercises = ref([])
  const exercisesPage = ref(1)
  const exercisesLastPage = ref(1)
  const exercisesPerPage = ref(30)
  const exercisesTotal = ref(0)
  const exercisesLoading = ref(false)
  const filters = ref({
    status: '',
    target_muscle_group: '',
    search: '',
    created_by: ''
  })

  async function fetchPending(page = 1) {
    pendingLoading.value = true
    try {
      const response = await api.get('/admin/exercises/pending', { params: { page } })
      pending.value = response.data.data
      const meta = response.data.meta
      pendingPage.value = meta?.current_page || 1
      pendingLastPage.value = meta?.last_page || 1
      pendingPerPage.value = meta?.per_page || 30
      pendingTotal.value = meta?.total || 0
    } catch (e) {
      console.error('Failed to fetch pending exercises:', e)
    } finally {
      pendingLoading.value = false
    }
  }

  async function fetchExercises(page = 1) {
    exercisesLoading.value = true
    try {
      const response = await api.get('/admin/exercises', {
        params: {
          page,
          // Omit blank filters so they don't narrow the query.
          status: filters.value.status || undefined,
          target_muscle_group: filters.value.target_muscle_group || undefined,
          search: filters.value.search || undefined,
          created_by: filters.value.created_by || undefined
        }
      })
      exercises.value = response.data.data
      const meta = response.data.meta
      exercisesPage.value = meta?.current_page || 1
      exercisesLastPage.value = meta?.last_page || 1
      exercisesPerPage.value = meta?.per_page || 30
      exercisesTotal.value = meta?.total || 0
    } catch (e) {
      console.error('Failed to fetch exercises:', e)
    } finally {
      exercisesLoading.value = false
    }
  }

  // Approve/reject a pending exercise, then refresh both lists so the queue
  // shrinks and the all-exercises view reflects the new status. Throws on
  // failure so the caller can clear its busy state (the interceptor toasts).
  async function approveExercise(id) {
    await api.post(`/admin/exercises/${id}/approve`)
    useToastStore().success('Exercise approved.')
    await refresh()
  }

  async function rejectExercise(id, reason) {
    await api.post(`/admin/exercises/${id}/reject`, { reason: reason || undefined })
    useToastStore().success('Exercise rejected.')
    await refresh()
  }

  // Reload whatever page each list is currently showing.
  async function refresh() {
    await Promise.all([
      fetchPending(pendingPage.value),
      fetchExercises(exercisesPage.value)
    ])
  }

  function resetFilters() {
    filters.value = { status: '', target_muscle_group: '', search: '', created_by: '' }
  }

  function reset() {
    pending.value = []
    pendingPage.value = 1
    pendingLastPage.value = 1
    pendingPerPage.value = 30
    pendingTotal.value = 0
    pendingLoading.value = false
    exercises.value = []
    exercisesPage.value = 1
    exercisesLastPage.value = 1
    exercisesPerPage.value = 30
    exercisesTotal.value = 0
    exercisesLoading.value = false
    resetFilters()
  }

  return {
    pending,
    pendingPage,
    pendingLastPage,
    pendingPerPage,
    pendingTotal,
    pendingLoading,
    exercises,
    exercisesPage,
    exercisesLastPage,
    exercisesPerPage,
    exercisesTotal,
    exercisesLoading,
    filters,
    fetchPending,
    fetchExercises,
    approveExercise,
    rejectExercise,
    refresh,
    resetFilters,
    reset
  }
})
