// Client-side export of workout history to CSV or JSON. Generated here rather
// than by the API: the history endpoint already returns everything the file
// needs, so export is a pure transform of data the app has fetched.
//
// Weights are stored canonically in kg; both formats emit the user's chosen
// display unit (with the unit named in the header/envelope) so the numbers match
// what the app shows.
import { fromKg } from './units'

// Round a converted weight to one decimal — enough precision for lbs, and it
// keeps the CSV clean (no long binary-float tails).
function roundWeight(kg, unit) {
  return Math.round(fromKg(kg, unit) * 10) / 10
}

// Local date/time parts, matching how the app renders the log timestamp — an ISO
// UTC string would read as the "wrong" day for anyone west of GMT.
function dateParts(timestamp) {
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return { date: '', time: '' }
  const pad = (n) => String(n).padStart(2, '0')
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  }
}

/**
 * Reshape the raw workout logs (as returned by GET /workout-logs) into a
 * neutral, unit-independent structure: one entry per workout, its sets grouped
 * by exercise and numbered per exercise in performed order — the same grouping
 * History.vue renders on screen. Weights stay in kg here; the emitters convert.
 */
function normalizeHistory(logs) {
  return logs.map((log) => {
    const sets = log.sets || []

    // Group sets by exercise, preserving first-seen order.
    const groups = new Map()
    sets.forEach((set) => {
      if (!groups.has(set.exercise_id)) {
        groups.set(set.exercise_id, {
          name: set.exercise?.name || 'Unknown Exercise',
          target_muscle_group: set.exercise?.target_muscle_group ?? null,
          sets: [],
        })
      }
      groups.get(set.exercise_id).sets.push(set)
    })

    const exercises = [...groups.values()].map((group) => {
      group.sets.sort((a, b) => a.set_order - b.set_order)
      return {
        name: group.name,
        target_muscle_group: group.target_muscle_group,
        sets: group.sets.map((set, index) => ({
          set: index + 1,
          set_type: set.set_type || 'working',
          weight_kg: Number(set.weight) || 0,
          reps: set.reps,
          rpe: set.rpe ?? null,
        })),
      }
    })

    let durationMin = null
    if (log.ended_at) {
      const ms = new Date(log.ended_at) - new Date(log.date_timestamp)
      if (ms > 0) durationMin = Math.round(ms / 60000)
    }

    return {
      logged_at: log.date_timestamp,
      ended_at: log.ended_at ?? null,
      day: log.day?.day_name ?? 'Unknown Day',
      program: log.day?.program?.name ?? 'Unknown Program',
      notes: log.notes ?? null,
      duration_min: durationMin,
      exercises,
    }
  })
}

// RFC-4180 cell escaping: wrap in quotes and double any internal quote when the
// value carries a comma, quote, or newline. Exercise names and notes are
// user-supplied, so this is not optional.
function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Build a CSV string: one row per set, newest workouts first (endpoint order). */
export function buildHistoryCsv(logs, unit) {
  const header = ['date', 'time', 'day', 'program', 'exercise', 'set', 'set_type', `weight_${unit}`, 'reps', 'rpe']
  const rows = [header.join(',')]

  normalizeHistory(logs).forEach((workout) => {
    const { date, time } = dateParts(workout.logged_at)
    workout.exercises.forEach((exercise) => {
      exercise.sets.forEach((set) => {
        rows.push(
          [
            date,
            time,
            workout.day,
            workout.program,
            exercise.name,
            set.set,
            set.set_type,
            roundWeight(set.weight_kg, unit),
            set.reps,
            set.rpe ?? '',
          ]
            .map(csvCell)
            .join(',')
        )
      })
    })
  })

  return rows.join('\r\n')
}

/** Build the JSON export object: a versioned envelope wrapping the full history. */
export function buildHistoryJson(logs, unit) {
  const workouts = normalizeHistory(logs).map((workout) => ({
    ...workout,
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({
        set: set.set,
        set_type: set.set_type,
        weight: roundWeight(set.weight_kg, unit),
        reps: set.reps,
        rpe: set.rpe,
      })),
    })),
  }))

  return {
    app: 'hyperion',
    export_type: 'workout_history',
    schema_version: 1,
    exported_at: new Date().toISOString(),
    unit,
    workout_count: workouts.length,
    workouts,
  }
}

/** A dated, filesystem-safe download name, e.g. hyperion-history-2026-07-17.csv. */
export function historyFileName(extension) {
  const { date } = dateParts(Date.now())
  return `hyperion-history-${date}.${extension}`
}

/** Trigger a download of `text` as a file, then release the blob URL. */
export function downloadTextFile(text, fileName, mimeType) {
  const blob = new Blob([text], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
