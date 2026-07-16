// The program export/import file format. Mirrors App\Services\ProgramFile on the
// backend — change the two together, since import validates against those values.
export const APP_MARKER = 'hyperion'
export const SCHEMA_VERSION = 1

// A program file is generated here rather than by the API: the store already
// holds everything the file needs, so export costs no request and works offline.

/**
 * Build the file contents for a program.
 *
 * Exercises are written by NAME, not id — an id is meaningless in another
 * account's catalog, whereas names are unique and resolvable (see
 * ProgramImporter). Account-specific state (ids, is_active, is_public,
 * timestamps) is deliberately left out.
 *
 * @param {object} program  the program meta from user_programs
 * @param {Array}  days     that program's days, in display order
 * @param {(id:number) => object|undefined} findExercise  id -> exercise lookup
 */
export function buildProgramFile(program, days, findExercise) {
  return {
    app: APP_MARKER,
    schema_version: SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    program: {
      name: program.name,
      days: days.map((day, index) => ({
        day_name: day.day_name,
        display_order: index,
        exercises: day.exercises
          .map(exerciseId => {
            const exercise = findExercise(exerciseId)
            // An exercise the store somehow doesn't know is skipped rather than
            // written as null — a file must be resolvable to be importable.
            if (!exercise) return null
            // The store's prescriptions are already limited to PRESCRIPTION_KEYS
            // (see mapApiDay), so they pass straight through — empties dropped
            // so the file carries "unset", not null.
            const rx = day.prescriptions?.[exerciseId] || {}
            const entry = {
              name: exercise.name,
              target_muscle_group: exercise.target_muscle_group ?? null
            }
            Object.entries(rx).forEach(([key, value]) => {
              if (value !== '' && value !== null && value !== undefined) entry[key] = value
            })
            return entry
          })
          .filter(Boolean)
      }))
    }
  }
}

/** A filesystem-safe name for the download, e.g. "Push / Pull" -> "push-pull". */
export function programFileName(programName) {
  const slug = String(programName || 'program')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `hyperion-${slug || 'program'}.json`
}

/** Trigger a download of `contents` as a .json file, then release the blob URL. */
export function downloadProgramFile(contents, fileName) {
  const blob = new Blob([JSON.stringify(contents, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/**
 * Parse a user-chosen file into the import payload.
 * Throws an Error with a user-facing message — the server validates the shape
 * properly, so this only catches what's cheap to catch before the request.
 */
export function parseProgramFile(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('That file is not a Hyperion program file.')
  }
  if (parsed.app !== APP_MARKER) {
    throw new Error('That file is not a Hyperion program file.')
  }
  return parsed
}
