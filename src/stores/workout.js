import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'
import { useHistoryStore } from './history'
import { useToastStore } from './toast'
import { detectPRs } from '../utils/stats'
import { formatWeight } from '../utils/units'

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

  // Rest Timer State — anchored to a wall-clock end timestamp so the
  // countdown stays correct across refreshes and backgrounded tabs.
  const restEndsAt = ref(null) // epoch ms, persisted
  const restTimeLeft = ref(0)
  const isResting = ref(false)
  const timerEnabled = ref(true)
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

  async function finishWorkout() {
    if (!activeWorkoutDayId.value || activeWorkoutSets.value.length === 0) {
      cancelWorkout()
      return
    }

    const payload = {
      program_day_id: typeof activeWorkoutDayId.value === 'number' ? activeWorkoutDayId.value : null,
      date_timestamp: activeWorkoutStartTime.value || new Date().toISOString(),
      ended_at: new Date().toISOString(),
      sets: activeWorkoutSets.value.map((s, index) => ({
        exercise_id: s.exercise_id,
        weight: s.weight,
        reps: s.reps,
        rpe: s.rpe || null,
        set_type: s.set_type || 'working',
        set_order: index + 1
      }))
    }

    try {
      const historyStore = useHistoryStore()
      // Compare against history *before* the new log joins it.
      const prs = detectPRs(historyStore.workout_logs, payload.sets)

      const response = await api.post('/workout-logs', payload)
      if (response.data && response.data.data) {
        historyStore.workout_logs.unshift(response.data.data)
      }
      activeWorkoutDayId.value = null
      activeWorkoutStartTime.value = null
      activeWorkoutSets.value = []
      stopRestTimer()
      celebratePRs(prs)
    } catch (e) {
      console.error(e)
      throw e
    }
  }

  function celebratePRs(prs) {
    const toast = useToastStore()
    const exerciseName = id => {
      const historyStore = useHistoryStore()
      for (const log of historyStore.workout_logs) {
        const s = (log.sets || []).find(x => x.exercise_id === id && x.exercise)
        if (s) return s.exercise.name
      }
      return 'Exercise'
    }
    prs.slice(0, 3).forEach(pr => {
      const w = formatWeight(pr.weight, weightUnit.value)
      toast.success(`🎉 New PR — ${exerciseName(pr.exercise_id)}: ${w}${weightUnit.value} × ${pr.reps}`, 6000)
    })
  }

  function cancelWorkout() {
    activeWorkoutDayId.value = null
    activeWorkoutStartTime.value = null
    activeWorkoutSets.value = []
    stopRestTimer()
  }

  // weight arrives already converted to canonical kg by the caller.
  function logSet(exerciseId, weightKg, reps, rpe = 0, options = {}) {
    if (!activeWorkoutDayId.value) return null

    const set = {
      id: 'local-set-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      exercise_id: exerciseId,
      weight: Math.round(parseFloat(weightKg) * 100) / 100,
      reps: parseInt(reps),
      rpe: parseInt(rpe) || null,
      set_type: options.setType || 'working'
    }
    activeWorkoutSets.value.push(set)

    if (timerEnabled.value) {
      startRestTimer(options.restSeconds || defaultRestTime.value)
    }
    return set.id
  }

  // Returns the sets of the most recent logged session for an exercise,
  // ordered by set_order — used to prefill hints during a workout.
  function getPreviousSets(exerciseId) {
    const historyStore = useHistoryStore()
    for (const log of historyStore.workout_logs) {
      if (log.sets) {
        const sets = log.sets
          .filter(s => s.exercise_id === exerciseId)
          .sort((a, b) => a.set_order - b.set_order)
        if (sets.length > 0) return sets
      }
    }
    return []
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
    defaultRestTime.value = parseInt(s.default_rest_time)
    weightUnit.value = s.weight_unit || 'kg'
    serverSettings = {
      timer_enabled: !!s.timer_enabled,
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
      const response = await api.put('/user/settings', payload)
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
    stopRestTimer()
  }

  return {
    loading,
    activeWorkoutDayId,
    activeWorkoutSets,
    activeWorkoutStartTime,
    hasActiveSession,
    startWorkout,
    finishWorkout,
    cancelWorkout,
    logSet,
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
    defaultRestTime,
    weightUnit,
    fetchSettings,
    updateSettings,
    reset
  }
}, {
  persist: {
    paths: ['activeWorkoutDayId', 'activeWorkoutSets', 'activeWorkoutStartTime', 'restEndsAt', 'timerEnabled', 'defaultRestTime', 'weightUnit']
  }
})
