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
    reset
  }
})
