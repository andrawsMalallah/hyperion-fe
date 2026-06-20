import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'
import { useExerciseStore } from './exercise'

export const FAMOUS_SPLITS = [
  {
    id: 'tpl-ppl',
    name: 'Push / Pull / Legs',
    description: 'Classic 3-day program focusing on movement patterns.',
    days: ['Push', 'Pull', 'Legs']
  },
  {
    id: 'tpl-bro',
    name: 'Bro Split',
    description: '5-day program hitting one muscle group per day.',
    days: ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms']
  },
  {
    id: 'tpl-upper-lower',
    name: 'Upper / Lower',
    description: '4-day program alternating upper and lower body.',
    days: ['Upper 1', 'Lower 1', 'Upper 2', 'Lower 2']
  },
  {
    id: 'tpl-full-body',
    name: 'Full Body',
    description: '3-day program hitting the whole body each session.',
    days: ['Full Body A', 'Full Body B', 'Full Body C']
  }
]

export const useProgramStore = defineStore('program', () => {
  const user_splits = ref([])
  const split_days = ref([])
  const loading = ref(false)
  const draftSplit = ref(null)
  const fetchedSplitIds = ref(new Set())
  const isListLoaded = ref(false)

  async function fetchSplits(force = false) {
    if (!force && isListLoaded.value) return
    loading.value = true
    try {
      const response = await api.get('/splits')
      const splitsData = response.data.data
      
      user_splits.value = splitsData.map(s => ({
        id: s.id,
        split_name: s.split_name,
        is_active: s.is_active,
        created_at: s.created_at
      }))
      
      const exerciseStore = useExerciseStore()
      let allDays = []
      splitsData.forEach(s => {
        fetchedSplitIds.value.add(String(s.id))
        
        s.days.forEach(d => {
          d.exercises.forEach(e => {
            if (!exerciseStore.exercises.some(ex => ex.id === e.id)) {
              exerciseStore.exercises.push(e)
            }
          })
          
          allDays.push({
            id: d.id,
            split_id: s.id,
            day_name: d.day_name,
            display_order: d.display_order,
            exercises: d.exercises.map(e => e.id)
          })
        })
      })
      split_days.value = allDays
      isListLoaded.value = true
    } catch (e) {
      console.error(e);
    } finally {
      loading.value = false
    }
  }

  async function fetchSingleSplit(splitId, force = false) {
    const idStr = String(splitId)
    if (!force && fetchedSplitIds.value.has(idStr)) return
    
    loading.value = true
    try {
      const response = await api.get(`/splits/${splitId}`)
      const s = response.data.data
      
      const idx = user_splits.value.findIndex(item => String(item.id) === String(s.id))
      const splitMeta = {
        id: s.id,
        split_name: s.split_name,
        is_active: s.is_active,
        created_at: s.created_at
      }
      if (idx !== -1) {
        user_splits.value[idx] = splitMeta
      } else {
        user_splits.value.push(splitMeta)
      }
      
      split_days.value = split_days.value.filter(d => String(d.split_id) !== String(s.id))
      
      const exerciseStore = useExerciseStore()
      s.days.forEach(d => {
        d.exercises.forEach(e => {
          if (!exerciseStore.exercises.some(ex => ex.id === e.id)) {
            exerciseStore.exercises.push(e)
          }
        })
        
        split_days.value.push({
          id: d.id,
          split_id: s.id,
          day_name: d.day_name,
          display_order: d.display_order,
          exercises: d.exercises.map(e => e.id)
        })
      })
      
      fetchedSplitIds.value.add(idStr)
    } catch (e) {
      console.error(e)
    } finally {
      loading.value = false
    }
  }

  async function fetchSingleSplitByDay(dayId) {
    if (split_days.value.some(d => String(d.id) === String(dayId))) return
    
    loading.value = true
    try {
      const response = await api.get(`/splits/by-day/${dayId}`)
      const s = response.data.data
      
      const idx = user_splits.value.findIndex(item => String(item.id) === String(s.id))
      const splitMeta = {
        id: s.id,
        split_name: s.split_name,
        is_active: s.is_active,
        created_at: s.created_at
      }
      if (idx !== -1) {
        user_splits.value[idx] = splitMeta
      } else {
        user_splits.value.push(splitMeta)
      }
      
      split_days.value = split_days.value.filter(d => String(d.split_id) !== String(s.id))
      
      const exerciseStore = useExerciseStore()
      s.days.forEach(d => {
        d.exercises.forEach(e => {
          if (!exerciseStore.exercises.some(ex => ex.id === e.id)) {
            exerciseStore.exercises.push(e)
          }
        })
        
        split_days.value.push({
          id: d.id,
          split_id: s.id,
          day_name: d.day_name,
          display_order: d.display_order,
          exercises: d.exercises.map(e => e.id)
        })
      })
      
      fetchedSplitIds.value.add(String(s.id))
    } catch (e) {
      console.error(e)
    } finally {
      loading.value = false
    }
  }

  async function setActiveSplit(splitId) {
    const originalSplits = JSON.parse(JSON.stringify(user_splits.value))

    // Optimistically update local active states instantly
    user_splits.value.forEach(s => {
      s.is_active = (String(s.id) === String(splitId))
    })

    try {
      await api.put(`/splits/${splitId}`, { is_active: true })
    } catch (e) {
      console.error("Failed to set active split on server, rolling back:", e)
      user_splits.value = originalSplits
    }
  }

  function initDraftFromTemplate(template) {
    draftSplit.value = {
      id: 'draft',
      split_name: template.name,
      is_active: true,
      days: template.days.map((dayName, index) => ({
        id: 'day-draft-' + Date.now() + '-' + index,
        split_id: 'draft',
        day_name: dayName,
        display_order: index + 1,
        exercises: []
      }))
    }
  }

  function initDraftCustom(name) {
    draftSplit.value = {
      id: 'draft',
      split_name: name || 'Custom Program',
      is_active: true,
      days: []
    }
  }

  async function saveNewSplit(draftSplitData) {
    const payload = {
      split_name: draftSplitData.split_name,
      is_active: false,
      days: draftSplitData.days.map((d, index) => ({
        day_name: d.day_name,
        display_order: index + 1,
        exercises: d.exercises.map(exId => ({ exercise_id: exId }))
      }))
    }

    try {
      const response = await api.post('/splits', payload)
      const newSplit = response.data.data
      
      user_splits.value.push({
        id: newSplit.id,
        split_name: newSplit.split_name,
        is_active: newSplit.is_active,
        created_at: newSplit.created_at
      })

      fetchedSplitIds.value.add(String(newSplit.id))

      if (newSplit.days) {
        newSplit.days.forEach(d => {
          split_days.value.push({
            id: d.id,
            split_id: newSplit.id,
            day_name: d.day_name,
            display_order: d.display_order,
            exercises: d.exercises ? d.exercises.map(e => e.id) : []
          })
        })
      }

      draftSplit.value = null
      return newSplit.id
    } catch (e) {
      console.error(e)
      throw e
    }
  }

  function addDayToSplit(splitId, dayName) {
    // Modify locally. User must hit "Save Split" to persist to DB.
    const daysInSplit = split_days.value.filter(d => d.split_id === splitId)
    const newOrder = daysInSplit.length > 0 ? Math.max(...daysInSplit.map(d => d.display_order)) + 1 : 1
    
    split_days.value.push({
      id: 'local-' + Date.now(),
      split_id: splitId,
      day_name: dayName,
      display_order: newOrder,
      exercises: []
    })
  }

  function deleteDay(dayId) {
    split_days.value = split_days.value.filter(d => d.id !== dayId)
  }

  async function deleteSplit(splitId) {
    try {
      await api.delete(`/splits/${splitId}`)
      
      user_splits.value = user_splits.value.filter(s => String(s.id) !== String(splitId))
      split_days.value = split_days.value.filter(d => String(d.split_id) !== String(splitId))
      fetchedSplitIds.value.delete(String(splitId))
    } catch (e) {
      console.error(e)
    }
  }

  function updateDayExercises(dayId, newExercisesArray) {
    const day = split_days.value.find(d => d.id === dayId)
    if (day) {
      day.exercises = newExercisesArray
    }
  }

  function renameSplit(splitId, newName) {
    const split = user_splits.value.find(s => s.id === splitId)
    if (split) {
      split.split_name = newName
    }
  }

  async function syncSplitDays(splitId, draftDays) {
    const split = user_splits.value.find(s => s.id === splitId)
    if (!split) return;

    const payload = {
      split_name: split.split_name,
      is_active: split.is_active,
      days: draftDays.map((d, index) => {
        const payloadDay = {
          day_name: d.day_name,
          display_order: index + 1,
          exercises: d.exercises.map(exId => ({ exercise_id: exId }))
        }
        // If it has a real DB ID, include it so we don't recreate it
        if (typeof d.id === 'number' || (typeof d.id === 'string' && !d.id.startsWith('local-') && !d.id.startsWith('day-draft-'))) {
          payloadDay.id = d.id;
        }
        return payloadDay;
      })
    }

    try {
      const response = await api.put(`/splits/${splitId}`, payload)
      const updatedSplit = response.data.data
      
      split.split_name = updatedSplit.split_name
      split.is_active = updatedSplit.is_active
      
      split_days.value = split_days.value.filter(d => String(d.split_id) !== String(splitId))
      
      const exerciseStore = useExerciseStore()
      updatedSplit.days.forEach(d => {
        d.exercises.forEach(e => {
          if (!exerciseStore.exercises.some(ex => ex.id === e.id)) {
            exerciseStore.exercises.push(e)
          }
        })
        
        split_days.value.push({
          id: d.id,
          split_id: updatedSplit.id,
          day_name: d.day_name,
          display_order: d.display_order,
          exercises: d.exercises.map(e => e.id)
        })
      })
      
      fetchedSplitIds.value.add(String(splitId))
    } catch (e) {
      console.error(e)
      throw e
    }
  }

  function reset() {
    user_splits.value = []
    split_days.value = []
    draftSplit.value = null
    fetchedSplitIds.value.clear()
    isListLoaded.value = false
  }

  return { 
    user_splits, 
    split_days, 
    loading,
    draftSplit,
    fetchedSplitIds,
    isListLoaded,
    fetchSplits,
    fetchSingleSplit,
    fetchSingleSplitByDay,
    setActiveSplit,
    initDraftFromTemplate,
    initDraftCustom,
    saveNewSplit,
    addDayToSplit,
    deleteDay,
    deleteSplit,
    updateDayExercises,
    renameSplit,
    syncSplitDays,
    reset
  }
})
