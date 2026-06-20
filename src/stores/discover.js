import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

export const useDiscoverStore = defineStore('discover', () => {
  const discoverPrograms = ref([])
  const discoverPage = ref(1)
  const discoverLoading = ref(false)
  const discoverHasMore = ref(true)
  const searchQuery = ref('')

  const isLoaded = ref(false)

  async function fetchDiscoverPrograms(reset = false, isScroll = false) {
    if (discoverLoading.value) return
    if (!reset && !isScroll && isLoaded.value) return

    discoverLoading.value = true
    try {
      if (reset) {
        discoverPage.value = 1
        discoverPrograms.value = []
        discoverHasMore.value = true
      }

      const response = await api.get('/programs/discover', {
        params: {
          page: discoverPage.value,
          search: searchQuery.value || undefined
        }
      })

      const newPrograms = response.data.data
      const meta = response.data.meta

      discoverPrograms.value = [...discoverPrograms.value, ...newPrograms]

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
    discoverPrograms.value = []
    discoverPage.value = 1
    discoverLoading.value = false
    discoverHasMore.value = true
    searchQuery.value = ''
    isLoaded.value = false
  }

  return {
    discoverPrograms,
    discoverPage,
    discoverLoading,
    discoverHasMore,
    searchQuery,
    isLoaded,
    fetchDiscoverPrograms,
    reset
  }
})
