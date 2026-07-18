import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api'
import { useToastStore } from './toast'

// Body-weight tracking (ROADMAP 1.10). Entries are stored canonically in kg
// (like set weights) and kept oldest-first — the order the Progress chart plots
// and the recent-entries list reverses. Not persisted: it's a read-through cache
// like the progress store, refetched on the Progress page.
export const useBodyweightStore = defineStore('bodyweight', () => {
  // [{ id, weight (kg), measured_on ('YYYY-MM-DD') }], oldest first.
  const entries = ref([])
  const loading = ref(false)
  const saving = ref(false)
  const isLoaded = ref(false)

  // Most recent entry, or null. Drives the card's "current weight".
  const latest = computed(() =>
    entries.value.length ? entries.value[entries.value.length - 1] : null
  )

  async function fetch(force = false) {
    if (loading.value) return
    if (!force && isLoaded.value) return

    loading.value = true
    try {
      const response = await api.get('/body-metrics', { suppressErrorToast: true })
      entries.value = response.data.data || []
      isLoaded.value = true
    } catch (e) {
      console.error('Failed to fetch body weight:', e)
      useToastStore().error('Could not load your body-weight history.')
    } finally {
      loading.value = false
    }
  }

  // Log (or correct) the weight for a date. Weight is already in kg. The server
  // upserts on the date; mirror that locally so re-logging today updates the
  // single entry instead of appending a duplicate.
  async function logWeight(weightKg, measuredOn) {
    saving.value = true
    try {
      const response = await api.post('/body-metrics', {
        weight: weightKg,
        measured_on: measuredOn,
      })
      const saved = response.data.data
      const existingIndex = entries.value.findIndex(entry => entry.measured_on === saved.measured_on)
      if (existingIndex !== -1) {
        entries.value[existingIndex] = saved
      } else {
        entries.value.push(saved)
        // Keep oldest-first after an out-of-order (back-dated) entry.
        entries.value.sort((a, b) => a.measured_on.localeCompare(b.measured_on))
      }
      return true
    } catch (e) {
      // 422s surface a field message via the shared interceptor toast; only log
      // the unexpected here.
      if (e.response?.status !== 422) {
        console.error('Failed to log body weight:', e)
      }
      return false
    } finally {
      saving.value = false
    }
  }

  async function remove(id) {
    try {
      await api.delete(`/body-metrics/${id}`)
      entries.value = entries.value.filter(entry => entry.id !== id)
      return true
    } catch (e) {
      console.error('Failed to delete body-weight entry:', e)
      useToastStore().error('Could not delete that entry.')
      return false
    }
  }

  function reset() {
    entries.value = []
    loading.value = false
    saving.value = false
    isLoaded.value = false
  }

  return { entries, loading, saving, isLoaded, latest, fetch, logWeight, remove, reset }
})
