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

  async function fetchHistory(reset = false, isScroll = false) {
    if (historyLoading.value) return
    if (!reset && !isScroll && isLoaded.value) return

    historyLoading.value = true
    loadFailed.value = false
    try {
      if (reset) {
        historyPage.value = 1
        workout_logs.value = []
        historyHasMore.value = true
      }

      const response = await api.get('/workout-logs', {
        params: {
          page: historyPage.value
        }
      })

      const newLogs = response.data.data
      const meta = response.data.meta

      workout_logs.value = [...workout_logs.value, ...newLogs]

      const currentPage = meta?.current_page || 1
      const lastPage = meta?.last_page || 1

      if (currentPage >= lastPage) {
        historyHasMore.value = false
      } else {
        historyPage.value++
      }
      isLoaded.value = true
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
