import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'
import { useToastStore } from './toast'

export const useHistoryStore = defineStore('history', () => {
  const workout_logs = ref([])
  const historyPage = ref(1)
  const historyHasMore = ref(true)
  const historyLoading = ref(false)
  const loadFailed = ref(false)

  const isLoaded = ref(false)

  const STALE_AFTER_MS = 60000
  let lastLoadedAt = 0

  async function fetchHistory(reset = false, isScroll = false) {
    if (historyLoading.value) return

    // Cached and fresh: serve as-is. Cached but stale: quietly revalidate
    // from page 1 without flashing an empty list.
    let replace = reset
    if (!reset && !isScroll && isLoaded.value) {
      if (Date.now() - lastLoadedAt < STALE_AFTER_MS) return
      replace = true
    }

    historyLoading.value = true
    loadFailed.value = false
    try {
      const page = replace ? 1 : historyPage.value
      const response = await api.get('/workout-logs', {
        params: { page },
        suppressErrorToast: true
      })

      const newLogs = response.data.data
      const meta = response.data.meta

      workout_logs.value = replace ? newLogs : [...workout_logs.value, ...newLogs]

      const currentPage = meta?.current_page || 1
      const lastPage = meta?.last_page || 1

      historyHasMore.value = currentPage < lastPage
      historyPage.value = currentPage < lastPage ? page + 1 : page
      isLoaded.value = true
      lastLoadedAt = Date.now()
    } catch (e) {
      console.error('Failed to fetch history:', e)
      loadFailed.value = true
      useToastStore().error('Could not load workout history.')
    } finally {
      historyLoading.value = false
    }
  }

  // Put a just-saved workout at the top of the list, so History reflects it
  // without a refetch. Shared by the online finish path (workout store) and the
  // offline outbox drain (sync store) — the two ways a log gets created.
  //
  // Only touches an ALREADY-LOADED list: if History hasn't been opened yet it
  // fetches fresh on first visit, and prepending now would duplicate the entry
  // once that fetch appends page 1.
  //
  // The client_uuid check is what makes this safe for the outbox: a retry of a
  // payload the server already stored comes back as the existing log, which may
  // already be sitting in the list.
  function prependLog(saved) {
    if (!saved || !isLoaded.value) return false
    const duplicate = saved.client_uuid &&
      workout_logs.value.some(l => l.client_uuid === saved.client_uuid)
    if (duplicate) return false
    workout_logs.value.unshift(saved)
    return true
  }

  // Delete a logged workout. Removes it from the local list on success so the
  // History view updates without a refetch. Server-side best_e1rm recomputes on
  // the next recent-sets call, so PR data self-corrects.
  async function deleteWorkout(id) {
    await api.delete(`/workout-logs/${id}`)
    workout_logs.value = workout_logs.value.filter(l => l.id !== id)
  }

  // Replace a workout's sets and/or notes (edit modal, or a notes-only patch
  // from the post-save summary). Splices the server's fresh copy back into the
  // local list so the card re-renders immediately.
  async function updateWorkout(id, payload) {
    const response = await api.put(`/workout-logs/${id}`, payload)
    const saved = response.data && response.data.data
    if (saved) {
      const idx = workout_logs.value.findIndex(l => l.id === id)
      if (idx !== -1) workout_logs.value[idx] = saved
    }
    return saved
  }

  function reset() {
    workout_logs.value = []
    historyPage.value = 1
    historyHasMore.value = true
    historyLoading.value = false
    loadFailed.value = false
    isLoaded.value = false
  }

  return {
    workout_logs,
    historyPage,
    historyHasMore,
    historyLoading,
    loadFailed,
    isLoaded,
    fetchHistory,
    prependLog,
    deleteWorkout,
    updateWorkout,
    reset
  }
})
