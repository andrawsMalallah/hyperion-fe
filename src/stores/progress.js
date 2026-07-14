import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'
import { useToastStore } from './toast'

// Progress-page aggregates, computed server-side by GET /progress/stats
// (e1RM trends, weekly volume, recent PRs, this-week tiles). Replaces the old
// flow that downloaded up to 5 pages of full history and crunched it locally.
// Stale-while-revalidate like the other read stores.
export const useProgressStore = defineStore('progress', () => {
  const week = ref({ sessions: 0, volume: 0 })
  const exercises = ref([])          // [{ id, name, count }], most-logged first
  const weeklyVolume = ref([])       // [{ week_start, volume }], oldest first
  const recentPrs = ref([])          // [{ exercise_id, exercise, date, weight, reps, e1rm }]
  const e1rmByExercise = ref({})     // { <exerciseId>: [{ date, e1rm, weight, reps }] }

  const loading = ref(false)
  const isLoaded = ref(false)
  const loadFailed = ref(false)
  // True while a single exercise's series is being lazy-loaded on selection.
  const seriesLoading = ref(false)

  const STALE_AFTER_MS = 60000
  let lastLoadedAt = 0

  async function fetchStats(force = false) {
    if (loading.value) return
    // Serve the cache while fresh; revalidate once stale.
    if (!force && isLoaded.value && Date.now() - lastLoadedAt < STALE_AFTER_MS) return

    loading.value = true
    loadFailed.value = false
    try {
      const response = await api.get('/progress/stats', { suppressErrorToast: true })
      const data = response.data.data
      week.value = data.week || { sessions: 0, volume: 0 }
      exercises.value = data.exercises || []
      weeklyVolume.value = data.weekly_volume || []
      recentPrs.value = data.recent_prs || []
      e1rmByExercise.value = data.e1rm_by_exercise || {}
      isLoaded.value = true
      lastLoadedAt = Date.now()
    } catch (e) {
      console.error('Failed to fetch progress stats:', e)
      loadFailed.value = true
      useToastStore().error('Could not load your progress stats.')
    } finally {
      loading.value = false
    }
  }

  // Lazy-load one exercise's e1RM series on selection. No-op if already cached
  // (the page ships only the first exercise upfront; the rest come from here).
  async function fetchExerciseSeries(exerciseId) {
    if (exerciseId == null) return
    if (e1rmByExercise.value[exerciseId]) return // already cached — no API call

    seriesLoading.value = true
    try {
      const response = await api.get(`/progress/exercises/${exerciseId}/e1rm`, { suppressErrorToast: true })
      // Replace the object (not mutate) so the computed that reads it re-runs.
      e1rmByExercise.value = { ...e1rmByExercise.value, [exerciseId]: response.data.data || [] }
    } catch (e) {
      console.error('Failed to fetch exercise series:', e)
      useToastStore().error('Could not load this exercise’s history.')
    } finally {
      seriesLoading.value = false
    }
  }

  function reset() {
    week.value = { sessions: 0, volume: 0 }
    exercises.value = []
    weeklyVolume.value = []
    recentPrs.value = []
    e1rmByExercise.value = {}
    isLoaded.value = false
    loadFailed.value = false
    seriesLoading.value = false
    lastLoadedAt = 0
  }

  return {
    week,
    exercises,
    weeklyVolume,
    recentPrs,
    e1rmByExercise,
    loading,
    isLoaded,
    loadFailed,
    seriesLoading,
    fetchStats,
    fetchExerciseSeries,
    reset
  }
})
