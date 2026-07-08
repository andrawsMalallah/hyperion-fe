import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'
import { useExerciseStore } from './exercise'
import { useToastStore } from './toast'

export const FAMOUS_PROGRAMS = [
  {
    id: 'tpl-ppl',
    name: 'Push / Pull / Legs',
    description: 'Classic 3-day program focusing on movement patterns.',
    days: ['Push', 'Pull', 'Legs']
  },
  {
    id: 'tpl-bro',
    name: 'Bro Program',
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

export const PRESCRIPTION_KEYS = ['target_sets', 'rep_range_min', 'rep_range_max', 'target_rpe', 'rest_seconds', 'notes']

// Normalize an API day into the local shape. Prescriptions live on the
// pivot per exercise; locally we keep them keyed by exercise id.
function mapApiDay(d, programId) {
  const prescriptions = {}
  d.exercises.forEach(e => {
    if (e.pivot) {
      const rx = {}
      PRESCRIPTION_KEYS.forEach(k => {
        if (e.pivot[k] !== null && e.pivot[k] !== undefined) rx[k] = e.pivot[k]
      })
      if (Object.keys(rx).length > 0) prescriptions[e.id] = rx
    }
  })
  return {
    id: d.id,
    program_id: programId,
    day_name: d.day_name,
    display_order: d.display_order,
    last_performed_at: d.last_performed_at ?? null,
    exercises: d.exercises.map(e => e.id),
    prescriptions
  }
}

// Build the exercises payload for a day, dropping empty prescription values.
function dayExercisesPayload(d) {
  return d.exercises.map(exId => {
    const entry = { exercise_id: exId }
    const rx = d.prescriptions?.[exId] || {}
    PRESCRIPTION_KEYS.forEach(k => {
      const v = rx[k]
      if (v !== '' && v !== null && v !== undefined) entry[k] = v
    })
    return entry
  })
}

export const useProgramStore = defineStore('program', () => {
  const user_programs = ref([])
  const program_days = ref([])
  const loading = ref(false)
  const draftProgram = ref(null)
  const fetchedprogramIds = ref(new Set())
  const isListLoaded = ref(false)

  const STALE_AFTER_MS = 60000
  let lastLoadedAt = 0

  async function fetchPrograms(force = false) {
    // Serve the cache while fresh; quietly revalidate once it's stale.
    if (!force && isListLoaded.value && Date.now() - lastLoadedAt < STALE_AFTER_MS) return
    loading.value = true
    try {
      const response = await api.get('/programs', { suppressErrorToast: true })
      const programsData = response.data.data

      user_programs.value = programsData.map(s => ({
        id: s.id,
        name: s.name,
        is_active: s.is_active,
        is_public: s.is_public,
        created_at: s.created_at
      }))
      
      const exerciseStore = useExerciseStore()
      let allDays = []
      programsData.forEach(s => {
        fetchedprogramIds.value.add(String(s.id))
        
        s.days.forEach(d => {
          d.exercises.forEach(e => {
            if (!exerciseStore.exercises.some(ex => ex.id === e.id)) {
              exerciseStore.exercises.push(e)
            }
          })

          allDays.push(mapApiDay(d, s.id))
        })
      })
      program_days.value = allDays
      isListLoaded.value = true
      lastLoadedAt = Date.now()
    } catch (e) {
      console.error(e)
      useToastStore().error('Could not load your programs. Pull to retry or check your connection.')
    } finally {
      loading.value = false
    }
  }

  async function fetchSingleProgram(programId, force = false) {
    const idStr = String(programId)
    if (!force && fetchedprogramIds.value.has(idStr)) return
    
    loading.value = true
    try {
      const response = await api.get(`/programs/${programId}`)
      const s = response.data.data
      
      const idx = user_programs.value.findIndex(item => String(item.id) === String(s.id))
      const ProgramMeta = {
        id: s.id,
        name: s.name,
        is_active: s.is_active,
        is_public: s.is_public,
        created_at: s.created_at
      }
      if (idx !== -1) {
        user_programs.value[idx] = ProgramMeta
      } else {
        user_programs.value.push(ProgramMeta)
      }
      
      program_days.value = program_days.value.filter(d => String(d.program_id) !== String(s.id))
      
      const exerciseStore = useExerciseStore()
      s.days.forEach(d => {
        d.exercises.forEach(e => {
          if (!exerciseStore.exercises.some(ex => ex.id === e.id)) {
            exerciseStore.exercises.push(e)
          }
        })
        
        program_days.value.push(mapApiDay(d, s.id))
      })
      
      fetchedprogramIds.value.add(idStr)
    } catch (e) {
      console.error(e)
    } finally {
      loading.value = false
    }
  }

  async function fetchSingleProgramByDay(dayId) {
    if (program_days.value.some(d => String(d.id) === String(dayId))) return
    
    loading.value = true
    try {
      const response = await api.get(`/programs/by-day/${dayId}`, { suppressErrorToast: true })
      const s = response.data.data
      
      const idx = user_programs.value.findIndex(item => String(item.id) === String(s.id))
      const ProgramMeta = {
        id: s.id,
        name: s.name,
        is_active: s.is_active,
        is_public: s.is_public,
        created_at: s.created_at
      }
      if (idx !== -1) {
        user_programs.value[idx] = ProgramMeta
      } else {
        user_programs.value.push(ProgramMeta)
      }
      
      program_days.value = program_days.value.filter(d => String(d.program_id) !== String(s.id))
      
      const exerciseStore = useExerciseStore()
      s.days.forEach(d => {
        d.exercises.forEach(e => {
          if (!exerciseStore.exercises.some(ex => ex.id === e.id)) {
            exerciseStore.exercises.push(e)
          }
        })
        
        program_days.value.push(mapApiDay(d, s.id))
      })
      
      fetchedprogramIds.value.add(String(s.id))
    } catch (e) {
      console.error(e)
      useToastStore().error('Could not load this workout day.')
    } finally {
      loading.value = false
    }
  }

  async function setActiveProgram(programId) {
    const originalprograms = JSON.parse(JSON.stringify(user_programs.value))

    // Optimistically update local active states instantly
    user_programs.value.forEach(s => {
      s.is_active = (String(s.id) === String(programId))
    })

    try {
      await api.put(`/programs/${programId}`, { is_active: true }, { suppressErrorToast: true })
    } catch (e) {
      console.error("Failed to set active Program on server, rolling back:", e)
      user_programs.value = originalprograms
      useToastStore().error('Could not activate the program — change was reverted.')
    }
  }

  function initDraftFromTemplate(template) {
    draftProgram.value = {
      id: 'draft',
      name: template.name,
      is_active: true,
      days: template.days.map((dayName, index) => ({
        id: 'day-draft-' + Date.now() + '-' + index,
        program_id: 'draft',
        day_name: dayName,
        display_order: index + 1,
        exercises: [],
        prescriptions: {}
      }))
    }
  }

  function initDraftCustom(name) {
    draftProgram.value = {
      id: 'draft',
      name: name || 'Custom Program',
      is_active: true,
      days: []
    }
  }

  async function saveNewProgram(draftProgramData) {
    const payload = {
      name: draftProgramData.name,
      is_active: false,
      is_public: draftProgramData.is_public ?? true,
      days: draftProgramData.days.map((d, index) => ({
        day_name: d.day_name,
        display_order: index + 1,
        exercises: dayExercisesPayload(d)
      }))
    }

    try {
      const response = await api.post('/programs', payload)
      const newProgram = response.data.data
      
      user_programs.value.push({
        id: newProgram.id,
        name: newProgram.name,
        is_active: newProgram.is_active,
        is_public: newProgram.is_public,
        created_at: newProgram.created_at
      })

      fetchedprogramIds.value.add(String(newProgram.id))

      if (newProgram.days) {
        newProgram.days.forEach(d => {
          program_days.value.push(mapApiDay(d, newProgram.id))
        })
      }

      draftProgram.value = null
      return newProgram.id
    } catch (e) {
      console.error(e)
      throw e
    }
  }

  function addDayToProgram(programId, dayName) {
    // Modify locally. User must hit "Save Program" to persist to DB.
    const daysInProgram = program_days.value.filter(d => d.program_id === programId)
    const newOrder = daysInProgram.length > 0 ? Math.max(...daysInProgram.map(d => d.display_order)) + 1 : 1
    
    program_days.value.push({
      id: 'local-' + Date.now(),
      program_id: programId,
      day_name: dayName,
      display_order: newOrder,
      exercises: [],
      prescriptions: {}
    })
  }

  function deleteDay(dayId) {
    program_days.value = program_days.value.filter(d => d.id !== dayId)
  }

  async function deleteProgram(programId) {
    try {
      await api.delete(`/programs/${programId}`, { suppressErrorToast: true })
      
      user_programs.value = user_programs.value.filter(s => String(s.id) !== String(programId))
      program_days.value = program_days.value.filter(d => String(d.program_id) !== String(programId))
      fetchedprogramIds.value.delete(String(programId))
    } catch (e) {
      console.error(e)
      useToastStore().error('Could not delete the program.')
      throw e
    }
  }

  function updateDayExercises(dayId, newExercisesArray) {
    const day = program_days.value.find(d => d.id === dayId)
    if (day) {
      day.exercises = newExercisesArray
    }
  }

  function renameProgram(programId, newName) {
    const Program = user_programs.value.find(s => s.id === programId)
    if (Program) {
      Program.name = newName
    }
  }

  async function syncProgramDays(programId, draftDays) {
    const Program = user_programs.value.find(s => s.id === programId)
    if (!Program) return;

    const payload = {
      name: Program.name,
      is_active: Program.is_active,
      is_public: Program.is_public ?? true,
      days: draftDays.map((d, index) => {
        const payloadDay = {
          day_name: d.day_name,
          display_order: index + 1,
          exercises: dayExercisesPayload(d)
        }
        // If it has a real DB ID, include it so we don't recreate it
        if (typeof d.id === 'number' || (typeof d.id === 'string' && !d.id.startsWith('local-') && !d.id.startsWith('day-draft-'))) {
          payloadDay.id = d.id;
        }
        return payloadDay;
      })
    }

    try {
      const response = await api.put(`/programs/${programId}`, payload)
      const updatedProgram = response.data.data
      
      Program.name = updatedProgram.name
      Program.is_active = updatedProgram.is_active
      Program.is_public = updatedProgram.is_public
      
      program_days.value = program_days.value.filter(d => String(d.program_id) !== String(programId))
      
      const exerciseStore = useExerciseStore()
      updatedProgram.days.forEach(d => {
        d.exercises.forEach(e => {
          if (!exerciseStore.exercises.some(ex => ex.id === e.id)) {
            exerciseStore.exercises.push(e)
          }
        })

        program_days.value.push(mapApiDay(d, updatedProgram.id))
      })
      
      fetchedprogramIds.value.add(String(programId))
    } catch (e) {
      console.error(e)
      throw e
    }
  }

  function reset() {
    user_programs.value = []
    program_days.value = []
    draftProgram.value = null
    fetchedprogramIds.value.clear()
    isListLoaded.value = false
  }

  return { 
    user_programs, 
    program_days, 
    loading,
    draftProgram,
    fetchedprogramIds,
    isListLoaded,
    fetchPrograms,
    fetchSingleProgram,
    fetchSingleProgramByDay,
    setActiveProgram,
    initDraftFromTemplate,
    initDraftCustom,
    saveNewProgram,
    addDayToProgram,
    deleteDay,
    deleteProgram,
    updateDayExercises,
    renameProgram,
    syncProgramDays,
    reset
  }
})
