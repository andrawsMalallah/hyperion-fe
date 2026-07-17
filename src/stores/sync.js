import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'
import { useHistoryStore } from './history'
import { useToastStore } from './toast'

// Corrupt/partial localStorage must never break the outbox — mirror the auth
// store's tolerant read.
function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null')
  } catch {
    return null
  }
}

// A durable outbox for workouts finished without a working connection. Each
// queued payload carries a client_uuid, so re-uploading one the server has
// already seen (e.g. after a lost response) is deduped rather than doubled.
export const useSyncStore = defineStore('sync', () => {
  const queue = ref([])
  // Payloads the server permanently rejected (4xx). Kept as a recovery trail
  // rather than destroyed — losing logged sets silently is the worst possible
  // failure mode. Capped; no UI yet (recoverable from localStorage).
  const failed = ref([])
  const flushing = ref(false)

  const FAILED_MAX = 20

  const pendingCount = () => queue.value.length

  // The queue survives logout (deliberately — an offline workout must not die
  // with the session), so each item is stamped with its owner and flush() only
  // drains the signed-in user's items. Without the stamp, logging in as a
  // different account on the same device would upload the previous user's
  // workouts into the wrong account.
  function enqueue(payload) {
    queue.value.push({ ...payload, _user_id: readStoredUser()?.id ?? null })
  }

  // Attach notes to a still-queued payload (offline path: the summary modal
  // captures notes after the workout was already enqueued). They upload with
  // the workout when the queue next drains.
  function setNotes(clientUuid, notes) {
    const item = queue.value.find(p => p.client_uuid === clientUuid)
    if (item) item.notes = notes || null
  }

  function removeFromQueue(item) {
    const index = queue.value.indexOf(item)
    if (index !== -1) queue.value.splice(index, 1)
  }

  // Drain the outbox oldest-first. Stops on the first network or server (5xx)
  // failure so the remaining items keep their order and are retried next time.
  async function flush() {
    if (flushing.value || queue.value.length === 0) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    if (!localStorage.getItem('auth_token')) return
    const storedUser = readStoredUser()
    // An unverified account is blocked from every data route (409), so draining
    // would just fail and redirect. Hold the outbox until the email is verified.
    if (storedUser && storedUser.email_verified === false) return

    flushing.value = true
    const toast = useToastStore()
    const historyStore = useHistoryStore()
    let synced = 0

    try {
      // Only this user's items; a null stamp predates the stamping and is
      // treated as theirs. Other accounts' items stay queued for their owner.
      const drainable = queue.value.filter(
        p => p._user_id == null || p._user_id === storedUser?.id
      )

      for (const item of drainable) {
        // The stamp is outbox bookkeeping, not part of the API payload.
        const { _user_id, ...payload } = item
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
          removeFromQueue(item)
          synced++
        } catch (e) {
          // Only a definitive rejection (4xx: validation, auth) is dropped — a
          // retry can never succeed. A 5xx IS a response but a transient one
          // (Render deploy window, cold-start gateway timeout), so those stop
          // the drain and stay queued exactly like a network failure.
          if (e.response && e.response.status < 500) {
            removeFromQueue(item)
            failed.value.push(item)
            if (failed.value.length > FAILED_MAX) {
              failed.value = failed.value.slice(-FAILED_MAX)
            }
            toast.error('A saved workout was rejected on sync and set aside.')
          } else {
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

  return { queue, failed, flushing, pendingCount, enqueue, setNotes, flush }
}, {
  // Persist the outbox and the rejected-payload trail — never the transient
  // `flushing` flag, which would otherwise rehydrate as true mid-flight and
  // wedge every retry. (pinia-plugin-persistedstate v4 uses `pick`, not `paths`.)
  persist: {
    pick: ['queue', 'failed']
  }
})
