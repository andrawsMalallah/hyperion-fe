import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'
import { useHistoryStore } from './history'

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
  
  // Rest Timer State
  const restTimeLeft = ref(0)
  const isResting = ref(false)
  const timerEnabled = ref(true)
  const defaultRestTime = ref(90)
  const weightUnit = ref('kg')
  let timerInterval = null

  function startWorkout(dayId) {
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
      split_day_id: typeof activeWorkoutDayId.value === 'number' ? activeWorkoutDayId.value : null,
      date_timestamp: activeWorkoutStartTime.value || new Date().toISOString(),
      sets: activeWorkoutSets.value.map((s, index) => ({
        exercise_id: s.exercise_id,
        weight: s.weight,
        reps: s.reps,
        rpe: s.rpe || null,
        set_order: index + 1
      }))
    }

    try {
      const response = await api.post('/workout-logs', payload)
      if (response.data && response.data.data) {
        const historyStore = useHistoryStore()
        historyStore.workout_logs.unshift(response.data.data)
      }
      activeWorkoutDayId.value = null
      activeWorkoutStartTime.value = null
      activeWorkoutSets.value = []
      stopRestTimer()
    } catch (e) {
      console.error(e)
      throw e
    }
  }

  function cancelWorkout() {
    activeWorkoutDayId.value = null
    activeWorkoutStartTime.value = null
    activeWorkoutSets.value = []
    stopRestTimer()
  }

  function logSet(exerciseId, weight, reps, rpe = 0) {
    if (!activeWorkoutDayId.value) return

    activeWorkoutSets.value.push({
      id: 'local-set-' + Date.now(),
      exercise_id: exerciseId,
      weight: parseFloat(weight),
      reps: parseInt(reps),
      rpe: parseInt(rpe) || null
    })

    if (timerEnabled.value) {
      startRestTimer(defaultRestTime.value)
    }
  }
  
  function getPreviousLoad(exerciseId) {
    const historyStore = useHistoryStore()
    for (const log of historyStore.workout_logs) {
      if (log.sets) {
        const sets = log.sets.filter(s => s.exercise_id === exerciseId)
        if (sets.length > 0) {
          return { weight: sets[0].weight, reps: sets[0].reps }
        }
      }
    }
    return null
  }

  function startRestTimer(seconds) {
    stopRestTimer()
    restTimeLeft.value = seconds
    isResting.value = true
    
    timerInterval = setInterval(() => {
      restTimeLeft.value--
      if (restTimeLeft.value <= 0) {
        stopRestTimer()
      }
    }, 1000)
  }

  function stopRestTimer() {
    isResting.value = false
    restTimeLeft.value = 0
    if (timerInterval) clearInterval(timerInterval)
  }
  
  function removeSet(setId) {
    activeWorkoutSets.value = activeWorkoutSets.value.filter(s => s.id !== setId)
  }

  async function fetchSettings() {
    loading.value = true
    try {
      const response = await api.get('/user/settings')
      const s = response.data.data
      timerEnabled.value = !!s.timer_enabled
      defaultRestTime.value = parseInt(s.default_rest_time)
      weightUnit.value = s.weight_unit || 'kg'
    } catch (e) {
      console.error("Failed to fetch settings:", e)
    } finally {
      loading.value = false
    }
  }

  async function updateSettings(fields) {
    try {
      const response = await api.put('/user/settings', fields)
      const s = response.data.data
      timerEnabled.value = !!s.timer_enabled
      defaultRestTime.value = parseInt(s.default_rest_time)
      weightUnit.value = s.weight_unit || 'kg'
    } catch (e) {
      console.error("Failed to update settings:", e)
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
    startWorkout, 
    finishWorkout, 
    cancelWorkout,
    logSet,
    getPreviousLoad,
    restTimeLeft,
    isResting,
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
    paths: ['activeWorkoutDayId', 'activeWorkoutSets', 'activeWorkoutStartTime', 'timerEnabled', 'defaultRestTime', 'weightUnit']
  }
})
