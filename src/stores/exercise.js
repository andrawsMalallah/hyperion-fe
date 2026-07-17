import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

export const useExerciseStore = defineStore('exercise', () => {
  const exercises = ref([]) // Global dictionary for background views (never cleared on search)
  const catalog = ref([])   // Active list for modal selection (reset on search/pagination)
  const loading = ref(false)
  const isLoaded = ref(false)
  const exercisePage = ref(1)
  const exerciseHasMore = ref(true)
  const searchQuery = ref('')

  const fetchExercises = async (reset = false, isScroll = false) => {
    if (loading.value) return
    if (!reset && !isScroll && isLoaded.value) return

    loading.value = true
    try {
      if (reset) {
        exercisePage.value = 1
        catalog.value = []
        exerciseHasMore.value = true
        isLoaded.value = false
      } else if (!isScroll && !isLoaded.value) {
        exercisePage.value = 1
        catalog.value = []
        exerciseHasMore.value = true
      }

      const response = await api.get('/exercises', {
        params: {
          page: exercisePage.value,
          search: searchQuery.value || undefined
        }
      })

      const newExercises = response.data.data
      const meta = response.data.meta

      // 1. Merge into global dictionary (exercises) to keep lookups working
      const mergedDict = [...exercises.value]
      newExercises.forEach(e => {
        const idx = mergedDict.findIndex(ex => ex.id === e.id)
        if (idx > -1) {
          mergedDict[idx] = e
        } else {
          mergedDict.push(e)
        }
      })
      exercises.value = mergedDict

      // 2. Merge/append into active modal catalog
      const mergedCatalog = [...catalog.value]
      newExercises.forEach(e => {
        const idx = mergedCatalog.findIndex(ex => ex.id === e.id)
        if (idx > -1) {
          mergedCatalog[idx] = e
        } else {
          mergedCatalog.push(e)
        }
      })
      catalog.value = mergedCatalog

      const currentPage = meta?.current_page || 1
      const lastPage = meta?.last_page || 1

      if (currentPage >= lastPage || newExercises.length < 30) {
        exerciseHasMore.value = false
      } else {
        exercisePage.value++
      }
      isLoaded.value = true
    } catch (e) {
      console.error(e)
      exerciseHasMore.value = false
    } finally {
      loading.value = false
    }
  }

  const reset = () => {
    // Clear the dictionary too: it can hold exercises merged from the previous
    // account's program days (including their pending contributions), which
    // must not leak into whoever logs in next on this device.
    exercises.value = []
    catalog.value = []
    isLoaded.value = false
    exercisePage.value = 1
    exerciseHasMore.value = true
    searchQuery.value = ''
  }

  return {
    exercises,
    catalog,
    loading,
    isLoaded,
    exercisePage,
    exerciseHasMore,
    searchQuery,
    fetchExercises,
    reset
  }
})
