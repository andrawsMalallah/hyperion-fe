import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'
import { useToastStore } from './toast'

export const useDiscoverStore = defineStore('discover', () => {
  const discoverPrograms = ref([])
  const discoverPage = ref(1)
  const discoverLoading = ref(false)
  const discoverHasMore = ref(true)
  const searchQuery = ref('')

  const isLoaded = ref(false)

  const STALE_AFTER_MS = 60000
  let lastLoadedAt = 0

  async function fetchDiscoverPrograms(reset = false, isScroll = false) {
    if (discoverLoading.value) return

    // Cached and fresh: serve as-is. Cached but stale: quietly revalidate
    // from page 1 without flashing an empty grid.
    let replace = reset
    if (!reset && !isScroll && isLoaded.value) {
      if (Date.now() - lastLoadedAt < STALE_AFTER_MS) return
      replace = true
    }

    discoverLoading.value = true
    try {
      const page = replace ? 1 : discoverPage.value
      const response = await api.get('/programs/discover', {
        params: {
          page,
          search: searchQuery.value || undefined
        }
      })

      const newPrograms = response.data.data
      const meta = response.data.meta

      discoverPrograms.value = replace ? newPrograms : [...discoverPrograms.value, ...newPrograms]

      const currentPage = meta?.current_page || 1
      const lastPage = meta?.last_page || 1

      discoverHasMore.value = currentPage < lastPage
      discoverPage.value = currentPage < lastPage ? page + 1 : page
      isLoaded.value = true
      lastLoadedAt = Date.now()
    } catch (e) {
      console.error('Failed to fetch discover programs:', e)
      discoverHasMore.value = false
      useToastStore().error('Could not load community programs.')
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
