import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'
import { useHistoryStore } from './history'
import { useToastStore } from './toast'
import { useSyncStore } from './sync'
import { useProgramStore } from './program'
import { useExerciseStore } from './exercise'
import { detectPRs } from '../utils/stats'
import { countsTowardTonnage, measurementOf } from '../utils/measurement'

export const useWorkoutStore = defineStore('workout', () => {
  try {
    const stored = localStorage.getItem('workout')
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed && typeof parsed === 'object' && 'workout_logs' in parsed) {
        delete parsed.workout_logs
        localStorage.setItem('workout', JSON.stringify(parsed))
      }
    }
  } catch (e) {
    console.error('Failed to clean legacy localStorage keys:', e)
  }

  const loading = ref(false)

  // Active Workout State (Local until finished)
  const activeWorkoutDayId = ref(null)
  const activeWorkoutSets = ref([]) // local buffer of sets
  const activeWorkoutStartTime = ref(null)

  // Per-exercise summary loaded for the active day: { [exerciseId]: { last:
  // [sets], best_e1rm } }. Drives the "Last: …" hint and PR detection without
  // pulling the full workout history.
  const recentByExercise = ref({})

  // Rest Timer State — anchored to a wall-clock end timestamp so the
  // countdown stays correct across refreshes and backgrounded tabs.
  const restEndsAt = ref(null) // epoch ms, persisted
  const restTimeLeft = ref(0)
  const isResting = ref(false)
  const timerEnabled = ref(true)
  // Opt-in browser notification when the rest countdown ends while the tab is
  // backgrounded / the phone is locked (the beep + vibrate only reach a live tab).
  const restNotifications = ref(false)
  const defaultRestTime = ref(90)
  const weightUnit = ref('kg')
  let timerInterval = null
  let audioCtx = null

  const hasActiveSession = () =>
    activeWorkoutDayId.value !== null && activeWorkoutSets.value.length > 0

  function startWorkout(dayId) {
    // Resuming the same day must never wipe logged sets.
    if (activeWorkoutDayId.value === dayId && activeWorkoutSets.value.length > 0) {
      return
    }
    activeWorkoutDayId.value = dayId
    activeWorkoutStartTime.value = new Date().toISOString()
    activeWorkoutSets.value = []
  }

  // Resolves to a summary object once saved (server) or queued (offline):
  //   { status: 'online' | 'offline', prs, sets, volume, durationMs,
  //     logId, clientUuid }
  // `prs` are enriched with the exercise name for display. `logId` is the saved
  // server id (null when queued offline) and `clientUuid` identifies the queued
  // payload — together they let the summary modal attach session notes after
  // the save (online via PUT, offline by patching the queued payload). Throws
  // only on a server-side rejection (e.g. 422), leaving the session intact.
  // Returns null when there is nothing to save.
  async function finishWorkout() {
    if (!activeWorkoutDayId.value || activeWorkoutSets.value.length === 0) {
      cancelWorkout()
      return null
    }

    const payload = {
      // Stamped once here so a later offline retry is deduped server-side.
      client_uuid: newUuid(),
      program_day_id: typeof activeWorkoutDayId.value === 'number' ? activeWorkoutDayId.value : null,
      date_timestamp: activeWorkoutStartTime.value || new Date().toISOString(),
      ended_at: new Date().toISOString(),
      sets: activeWorkoutSets.value.map((s, index) => ({
        exercise_id: s.exercise_id,
        weight: s.weight,
        reps: s.reps ?? null,
        duration_seconds: s.duration_seconds ?? null,
        rpe: s.rpe || null,
        set_type: s.set_type || 'working',
        set_order: index + 1
      }))
    }

    const historyStore = useHistoryStore()
    // Compare against each exercise's prior best (loaded on the workout screen),
    // so PR detection needs no full-history fetch.
    const bestByExercise = {}
    for (const [id, entry] of Object.entries(recentByExercise.value)) {
      bestByExercise[id] = entry?.best_e1rm || 0
    }
    // Weighted sets only — e1RM is meaningless for a rep or hold count, and the
    // server reports no best_e1rm for those exercises anyway.
    const prs = enrichPRs(detectPRs(
      bestByExercise,
      payload.sets.filter(s => countsTowardTonnage(measurementFor(s.exercise_id)))
    ))

    // Session stats for the post-save summary (working sets are what the
    // athlete "did"; warmups don't count toward the volume total).
    const workingSets = payload.sets.filter(s => (s.set_type || 'working') !== 'warmup')
    // Tonnage counts weighted exercises only — matching the server's rule. A
    // bodyweight set's weight is added load, so counting it would report a
    // +20kg pull-up as 20kg lifted.
    const tonnageSets = workingSets.filter(s => countsTowardTonnage(measurementFor(s.exercise_id)))
    const summary = {
      prs,
      sets: workingSets.length,
      volume: Math.round(tonnageSets.reduce((acc, s) => acc + s.weight * s.reps, 0)),
      durationMs: Math.max(0, new Date(payload.ended_at) - new Date(payload.date_timestamp))
    }

    try {
      const response = await api.post('/workout-logs', payload)
      historyStore.prependLog(response.data?.data)
      markDayPerformed(payload.program_day_id, payload.ended_at)
      clearActiveWorkout()
      stopRestTimer()
      // Opportunistically drain anything queued from an earlier outage.
      useSyncStore().flush()
      const savedId = response.data?.data?.id ?? null
      return { status: 'online', ...summary, logId: savedId, clientUuid: payload.client_uuid }
    } catch (e) {
      // No response at all means offline / network failure — not a rejection.
      // Queue the workout locally and treat it as saved; it will upload when
      // the connection returns, deduped by client_uuid.
      if (!e.response) {
        useSyncStore().enqueue(payload)
        markDayPerformed(payload.program_day_id, payload.ended_at)
        clearActiveWorkout()
        stopRestTimer()
        return { status: 'offline', ...summary, logId: null, clientUuid: payload.client_uuid }
      }
      // The server responded with an error (e.g. validation). Keep the
      // session intact so the user can fix it, and surface the failure.
      console.error(e)
      throw e
    }
  }

  function clearActiveWorkout() {
    activeWorkoutDayId.value = null
    activeWorkoutStartTime.value = null
    activeWorkoutSets.value = []
  }

  // Keep the Home "Up next" rotation accurate immediately after finishing,
  // without waiting for the programs list to revalidate.
  function markDayPerformed(dayId, when) {
    if (typeof dayId !== 'number') return
    const day = useProgramStore().program_days.find(d => d.id === dayId)
    if (day) day.last_performed_at = when
  }

  function newUuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  // How an exercise is measured, resolved through the exercise catalog. An
  // exercise missing from the dictionary falls back to 'weighted', which is how
  // every set behaved before ROADMAP 1.9.
  function measurementFor(exerciseId) {
    return measurementOf(useExerciseStore().exercises.find(e => e.id === exerciseId))
  }

  // Attach the exercise name to each PR so the summary modal can render it
  // without another store lookup at display time.
  function enrichPRs(prs) {
    const exercises = useExerciseStore().exercises
    return prs.map(pr => {
      const ex = exercises.find(e => e.id === pr.exercise_id)
      return { ...pr, exerciseName: ex ? ex.name : 'Exercise' }
    })
  }

  function cancelWorkout() {
    activeWorkoutDayId.value = null
    activeWorkoutStartTime.value = null
    activeWorkoutSets.value = []
    stopRestTimer()
  }

  // weight arrives already converted to canonical kg by the caller. For
  // bodyweight exercises it's the ADDED load (0 when none); for timed ones,
  // `reps` is null and options.durationSeconds carries the hold instead.
  function logSet(exerciseId, weightKg, reps, rpe = 0, options = {}) {
    if (!activeWorkoutDayId.value) return null

    const duration = parseInt(options.durationSeconds)
    const set = {
      id: 'local-set-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      exercise_id: exerciseId,
      weight: Math.round((parseFloat(weightKg) || 0) * 100) / 100,
      // Null rather than 0/NaN: the API rejects a set that carries both a rep
      // count and a duration, so exactly one of these must be set.
      reps: reps === null || reps === '' || reps === undefined ? null : parseInt(reps),
      duration_seconds: Number.isFinite(duration) ? duration : null,
      rpe: parseInt(rpe) || null,
      set_type: options.setType || 'working'
    }
    activeWorkoutSets.value.push(set)

    // options.startRest is false for a set logged on any exercise but the last
    // of a superset / giant set: the group is performed back-to-back and rests
    // once, after its final exercise.
    if (timerEnabled.value && options.startRest !== false) {
      startRestTimer(options.restSeconds || defaultRestTime.value)
    }
    return set.id
  }

  // Fetch the per-exercise summary (last session + best e1rm) for the given
  // exercises in one request, replacing a full-history load on the workout page.
  async function fetchRecentSets(exerciseIds) {
    const ids = [...new Set((exerciseIds || []).filter(id => typeof id === 'number'))]
    if (ids.length === 0) {
      recentByExercise.value = {}
      return
    }
    try {
      const res = await api.get('/exercises/recent-sets', { params: { ids: ids.join(',') } })
      recentByExercise.value = res.data.data || {}
    } catch (e) {
      console.error('Failed to load recent sets:', e)
      recentByExercise.value = {}
    }
  }

  // The most recent session's sets for an exercise (ordered by set_order) —
  // used for the "Last: …" hint and to prefill row placeholders.
  function getPreviousSets(exerciseId) {
    return recentByExercise.value[exerciseId]?.last || []
  }

  function getPreviousLoad(exerciseId) {
    const sets = getPreviousSets(exerciseId)
    return sets.length > 0 ? { weight: sets[0].weight, reps: sets[0].reps } : null
  }

  function startRestTimer(seconds) {
    primeAudio()
    restEndsAt.value = Date.now() + seconds * 1000
    runTicker()
  }

  function extendRestTimer(seconds) {
    if (!restEndsAt.value) return
    restEndsAt.value += seconds * 1000
  }

  // Re-attach the ticker to a persisted end timestamp (after a page
  // refresh) or force a recompute when the tab becomes visible again.
  function resumeRestTimer() {
    if (restEndsAt.value && restEndsAt.value > Date.now()) {
      runTicker()
    } else if (restEndsAt.value) {
      // Expired while the app was closed — clear silently.
      clearRestState()
    }
  }

  function runTicker() {
    if (timerInterval) clearInterval(timerInterval)
    const tick = () => {
      if (!restEndsAt.value) {
        clearRestState()
        return
      }
      const left = Math.max(0, Math.ceil((restEndsAt.value - Date.now()) / 1000))
      restTimeLeft.value = left
      isResting.value = left > 0
      if (left <= 0) {
        notifyRestOver()
        clearRestState()
      }
    }
    tick()
    timerInterval = setInterval(tick, 250)
  }

  // Skip button — clears without the "rest over" cue.
  function stopRestTimer() {
    clearRestState()
  }

  function clearRestState() {
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
    restEndsAt.value = null
    isResting.value = false
    restTimeLeft.value = 0
  }

  // AudioContext must be created during a user gesture (saving a set) to
  // be allowed to play later when the countdown hits zero.
  function primeAudio() {
    try {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext
        if (Ctx) audioCtx = new Ctx()
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume()
      }
    } catch (e) {
      audioCtx = null
    }
  }

  function notifyRestOver() {
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200])
    }
    // When the tab is hidden (backgrounded / phone locked) the beep below can't
    // be heard and there's no visible countdown — surface a browser notification
    // instead, if the user opted in and granted permission. Kept to the hidden
    // case so a live, foregrounded tab isn't double-notified.
    showRestNotification()
    try {
      if (!audioCtx) return
      const now = audioCtx.currentTime
      ;[0, 0.25].forEach(offset => {
        const osc = audioCtx.createOscillator()
        const gain = audioCtx.createGain()
        osc.type = 'sine'
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.0001, now + offset)
        gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.2)
        osc.connect(gain)
        gain.connect(audioCtx.destination)
        osc.start(now + offset)
        osc.stop(now + offset + 0.22)
      })
    } catch (e) {
      // Audio is best-effort; vibration already fired.
    }
  }

  // Best-effort "rest over" browser notification for a backgrounded tab. Guarded
  // on the opt-in setting + granted permission + a hidden document. Prefers the
  // service worker's showNotification (reliable on mobile), falling back to a
  // page Notification. Notification Triggers aren't broadly supported, so this
  // reaches a backgrounded tab but not one the OS has fully killed.
  function showRestNotification() {
    try {
      if (!restNotifications.value) return
      if (typeof document !== 'undefined' && !document.hidden) return
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

      const title = 'Rest over'
      const options = {
        body: 'Time for your next set.',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'hyperion-rest-timer', // collapse repeats into one
        renotify: true,
      }

      if (navigator.serviceWorker?.ready) {
        navigator.serviceWorker.ready
          .then(reg => reg.showNotification(title, options))
          .catch(() => new Notification(title, options))
      } else {
        new Notification(title, options)
      }
    } catch (e) {
      // Notifications are best-effort; the beep/vibrate already fired.
    }
  }

  function removeSet(setId) {
    activeWorkoutSets.value = activeWorkoutSets.value.filter(s => s.id !== setId)
  }

  let settingsDebounce = null
  let pendingSettings = {}
  // Last state confirmed by the server — used to drop no-op writes when
  // watchers fire on programmatic changes (e.g. fetchSettings applying).
  let serverSettings = {}

  function applyServerSettings(s) {
    timerEnabled.value = !!s.timer_enabled
    restNotifications.value = !!s.rest_notifications
    defaultRestTime.value = parseInt(s.default_rest_time)
    weightUnit.value = s.weight_unit || 'kg'
    serverSettings = {
      timer_enabled: !!s.timer_enabled,
      rest_notifications: !!s.rest_notifications,
      default_rest_time: parseInt(s.default_rest_time),
      weight_unit: s.weight_unit || 'kg'
    }
  }

  async function fetchSettings() {
    loading.value = true
    try {
      const response = await api.get('/user/settings')
      // If the user changed a setting while this request was in flight,
      // keep their change — the pending PUT will reconcile the server.
      if (!settingsDebounce && Object.keys(pendingSettings).length === 0) {
        applyServerSettings(response.data.data)
      }
    } catch (e) {
      console.error('Failed to fetch settings:', e)
    } finally {
      loading.value = false
    }
  }

  function updateSettings(fields) {
    const changed = {}
    for (const [key, value] of Object.entries(fields)) {
      if (serverSettings[key] !== value) changed[key] = value
    }
    if (Object.keys(changed).length === 0) return

    // Coalesce rapid toggles into one request.
    pendingSettings = { ...pendingSettings, ...changed }
    if (settingsDebounce) clearTimeout(settingsDebounce)
    settingsDebounce = setTimeout(flushSettings, 500)
  }

  async function flushSettings() {
    const payload = pendingSettings
    pendingSettings = {}
    settingsDebounce = null
    const toast = useToastStore()
    try {
      const response = await api.put('/user/settings', payload, { suppressErrorToast: true })
      applyServerSettings(response.data.data)
      toast.success('Settings saved')
    } catch (e) {
      console.error('Failed to update settings:', e)
      toast.error('Could not save settings — check your connection.')
      // Re-sync local state with the server's truth.
      fetchSettings()
    }
  }

  function reset() {
    activeWorkoutDayId.value = null
    activeWorkoutSets.value = []
    activeWorkoutStartTime.value = null
    recentByExercise.value = {}
    stopRestTimer()
  }

  return {
    loading,
    activeWorkoutDayId,
    activeWorkoutSets,
    activeWorkoutStartTime,
    recentByExercise,
    hasActiveSession,
    startWorkout,
    finishWorkout,
    cancelWorkout,
    logSet,
    fetchRecentSets,
    getPreviousLoad,
    getPreviousSets,
    restEndsAt,
    restTimeLeft,
    isResting,
    startRestTimer,
    extendRestTimer,
    resumeRestTimer,
    stopRestTimer,
    removeSet,
    timerEnabled,
    restNotifications,
    defaultRestTime,
    weightUnit,
    fetchSettings,
    updateSettings,
    reset
  }
}, {
  persist: {
    pick: ['activeWorkoutDayId', 'activeWorkoutSets', 'activeWorkoutStartTime', 'restEndsAt', 'timerEnabled', 'restNotifications', 'defaultRestTime', 'weightUnit']
  }
})
