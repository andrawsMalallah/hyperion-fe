import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'
import { useHistoryStore } from './history'
import { useToastStore } from './toast'

// A durable outbox for workouts finished without a working connection. Each
// queued payload carries a client_uuid, so re-uploading one the server has
// already seen (e.g. after a lost response) is deduped rather than doubled.
export const useSyncStore = defineStore('sync', () => {
  const queue = ref([])
  const flushing = ref(false)

  const pendingCount = () => queue.value.length

  function enqueue(payload) {
    queue.value.push(payload)
  }

  // Attach notes to a still-queued payload (offline path: the summary modal
  // captures notes after the workout was already enqueued). They upload with
  // the workout when the queue next drains.
  function setNotes(clientUuid, notes) {
    const item = queue.value.find(p => p.client_uuid === clientUuid)
    if (item) item.notes = notes || null
  }

  // Drain the outbox oldest-first. Stops on the first network failure so the
  // remaining items keep their order and are retried next time we're online.
  async function flush() {
    if (flushing.value || queue.value.length === 0) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    if (!localStorage.getItem('auth_token')) return
    // An unverified account is blocked from every data route (409), so draining
    // would just fail and redirect. Hold the outbox until the email is verified.
    try {
      const storedUser = JSON.parse(localStorage.getItem('user') || 'null')
      if (storedUser && storedUser.email_verified === false) return
    } catch { /* corrupt user JSON — let the normal flow handle it */ }

    flushing.value = true
    const toast = useToastStore()
    const historyStore = useHistoryStore()
    let synced = 0

    try {
      while (queue.value.length > 0) {
        const payload = queue.value[0]
        try {
          const response = await api.post('/workout-logs', payload, { suppressErrorToast: true })
          const saved = response.data && response.data.data
          // Only touch an already-loaded history list; otherwise the next
          // History visit fetches fresh (see workout store note).
          if (saved && historyStore.isLoaded) {
            const already = saved.client_uuid &&
              historyStore.workout_logs.some(l => l.client_uuid === saved.client_uuid)
            if (!already) historyStore.workout_logs.unshift(saved)
          }
          queue.value.shift()
          synced++
        } catch (e) {
          if (e.response) {
            // The server received and rejected it (validation, etc.) — a retry
            // will never succeed, so drop it rather than wedge the queue.
            queue.value.shift()
            toast.error('A saved workout was rejected on sync and could not be uploaded.')
          } else {
            // Still offline — leave the rest queued for the next attempt.
            break
          }
        }
      }
    } finally {
      flushing.value = false
    }

    if (synced > 0) {
      toast.success(synced === 1 ? 'Synced 1 offline workout' : `Synced ${synced} offline workouts`)
    }
  }

  return { queue, flushing, pendingCount, enqueue, setNotes, flush }
}, {
  // Persist only the outbox — never the transient `flushing` flag, which
  // would otherwise rehydrate as true mid-flight and wedge every retry.
  // (pinia-plugin-persistedstate v4 uses `pick`, not `paths`.)
  persist: {
    pick: ['queue']
  }
})
