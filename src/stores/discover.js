import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

export const useDiscoverStore = defineStore('discover', () => {
  const discoverSplits = ref([])
  const discoverPage = ref(1)
  const discoverLoading = ref(false)
  const discoverHasMore = ref(true)
  const searchQuery = ref('')

  const isLoaded = ref(false)

  async function fetchDiscoverSplits(reset = false, isScroll = false) {
    if (discoverLoading.value) return
    if (!reset && !isScroll && isLoaded.value) return

    discoverLoading.value = true
    try {
      if (reset) {
        discoverPage.value = 1
        discoverSplits.value = []
        discoverHasMore.value = true
      }

      const response = await api.get('/splits/discover', {
        params: {
          page: discoverPage.value,
          search: searchQuery.value || undefined
        }
      })

      const newSplits = response.data.data
      const meta = response.data.meta

      discoverSplits.value = [...discoverSplits.value, ...newSplits]

      const currentPage = meta?.current_page || 1
      const lastPage = meta?.last_page || 1

      if (currentPage >= lastPage) {
        discoverHasMore.value = false
      } else {
        discoverPage.value++
      }
      isLoaded.value = true
    } catch (e) {
      console.error('Failed to fetch discover splits:', e)
      discoverHasMore.value = false
    } finally {
      discoverLoading.value = false
    }
  }

  function reset() {
    discoverSplits.value = []
    discoverPage.value = 1
    discoverLoading.value = false
    discoverHasMore.value = true
    searchQuery.value = ''
    isLoaded.value = false
  }

  return {
    discoverSplits,
    discoverPage,
    discoverLoading,
    discoverHasMore,
    searchQuery,
    isLoaded,
    fetchDiscoverSplits,
    reset
  }
})
