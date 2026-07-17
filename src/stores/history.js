import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'
import { useToastStore } from './toast'
import { useWorkoutStore } from './workout'
import { buildHistoryCsv, buildHistoryJson, historyFileName, downloadTextFile } from '../utils/historyExport'

export const useHistoryStore = defineStore('history', () => {
  const workout_logs = ref([])
  const historyPage = ref(1)
  const historyHasMore = ref(true)
  const historyLoading = ref(false)
  const loadFailed = ref(false)
  const exporting = ref(false)

  const isLoaded = ref(false)

  // Active filters (Session: History filters). programId '' = all programs,
  // 'unknown' = sessions whose program was deleted, otherwise a program id.
  // range 'all' | '7' | '30' | '90' days. Not persisted — transient view state.
  const filters = ref({ programId: '', range: 'all' })

  const STALE_AFTER_MS = 60000
  let lastLoadedAt = 0

  // Translate the filter state into the API query params the index accepts.
  // The date range is resolved to a local `from` date here so it matches what
  // the user sees (a UTC cutoff could drop a session near midnight).
  function activeFilterParams() {
    const params = {}
    if (filters.value.programId) params.program_id = filters.value.programId

    const days = { 7: 7, 30: 30, 90: 90 }[filters.value.range]
    if (days) {
      const from = new Date()
      from.setDate(from.getDate() - days)
      const pad = (n) => String(n).padStart(2, '0')
      params.from = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`
    }
    return params
  }

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
        params: { page, ...activeFilterParams() },
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

  // Pull EVERY page of history, independent of what's scrolled into view — the
  // display list (workout_logs) is only the pages the user has lazily loaded, so
  // exporting that would silently truncate. Deliberately does not touch the
  // display state. Capped at a sane page ceiling so a bad `last_page` can't spin.
  async function fetchAllForExport() {
    const all = []
    let page = 1
    let lastPage = 1
    const MAX_PAGES = 1000
    do {
      const response = await api.get('/workout-logs', {
        params: { page },
        suppressErrorToast: true,
      })
      all.push(...response.data.data)
      lastPage = response.data.meta?.last_page || 1
      page++
    } while (page <= lastPage && page <= MAX_PAGES)
    return all
  }

  // Export the full workout history as a CSV or JSON download. Weights are
  // emitted in the user's current display unit (read from the workout store) so
  // the file matches the app. Orchestrated here — like programStore.exportProgram
  // — so the view stays presentational.
  async function exportHistory(format) {
    if (exporting.value) return
    exporting.value = true
    const toast = useToastStore()
    try {
      const logs = await fetchAllForExport()
      if (logs.length === 0) {
        toast.error('No workouts to export yet.')
        return
      }
      const unit = useWorkoutStore().weightUnit
      if (format === 'csv') {
        // Prepend a UTF-8 BOM so Excel reads exercise names/notes with non-ASCII
        // characters correctly instead of mojibake.
        downloadTextFile(String.fromCharCode(0xFEFF) + buildHistoryCsv(logs, unit), historyFileName('csv'), 'text/csv;charset=utf-8')
      } else {
        downloadTextFile(
          JSON.stringify(buildHistoryJson(logs, unit), null, 2),
          historyFileName('json'),
          'application/json'
        )
      }
      toast.success(`History exported as ${format.toUpperCase()}.`)
    } catch (e) {
      console.error('Failed to export history:', e)
      toast.error('Could not export history.')
    } finally {
      exporting.value = false
    }
  }

  // Apply a new filter set and reload from page 1. reset=true short-circuits the
  // stale-cache guard, so a filter change always hits the server.
  function setFilters(next) {
    filters.value = { ...filters.value, ...next }
    return fetchHistory(true)
  }

  function clearFilters() {
    return setFilters({ programId: '', range: 'all' })
  }

  function reset() {
    workout_logs.value = []
    historyPage.value = 1
    historyHasMore.value = true
    historyLoading.value = false
    loadFailed.value = false
    isLoaded.value = false
    filters.value = { programId: '', range: 'all' }
  }

  return {
    workout_logs,
    historyPage,
    historyHasMore,
    historyLoading,
    loadFailed,
    exporting,
    isLoaded,
    filters,
    fetchHistory,
    setFilters,
    clearFilters,
    prependLog,
    deleteWorkout,
    updateWorkout,
    exportHistory,
    reset
  }
})
