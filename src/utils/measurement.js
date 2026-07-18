// How an exercise's sets are measured. Mirrors the backend
// App\Services\ExerciseMeasurement — the values and the per-type field rules
// must match or the server will 422 on save.
//
// The type lives on the exercise, not the prescription: a plank is timed in
// every program it appears in.

export const WEIGHTED = 'weighted'
export const BODYWEIGHT = 'bodyweight'
export const TIMED = 'timed'

/** Longest single set the API accepts, in seconds. */
export const MAX_DURATION_SECONDS = 3600

const LABELS = {
  [WEIGHTED]: 'Weighted',
  [BODYWEIGHT]: 'Bodyweight',
  [TIMED]: 'Timed'
}

/** Options for the Contribute form's picker, in the order they're offered. */
export const MEASUREMENT_OPTIONS = [
  { value: WEIGHTED, label: LABELS[WEIGHTED], hint: 'Weight x reps — barbells, dumbbells, machines' },
  { value: BODYWEIGHT, label: LABELS[BODYWEIGHT], hint: 'Reps, with optional added weight — pull-ups, dips' },
  { value: TIMED, label: LABELS[TIMED], hint: 'Held for time — planks, hangs, carries' }
]

/** Anything without an explicit type behaves exactly as it did before. */
export function measurementOf(exercise) {
  return exercise?.measurement_type || WEIGHTED
}

export function measurementLabel(type) {
  return LABELS[type] || LABELS[WEIGHTED]
}

/** Rep-based types log reps; timed sets log a duration instead. */
export function usesReps(type) {
  return type !== TIMED
}

/** Weight is the load itself, rather than optional extra on top of body weight. */
export function requiresWeight(type) {
  return type === WEIGHTED
}

/**
 * Whether a set of this type feeds the weight-based training math (tonnage
 * volume, estimated 1RM). Only weighted does — a bodyweight set's weight is
 * ADDED load, so counting it would score a +20kg pull-up as a 20kg lift.
 */
export function countsTowardTonnage(type) {
  return type === WEIGHTED
}

const isBlank = value => value === '' || value === null || value === undefined

/**
 * Whether a set row holds enough to be logged, given its exercise's type.
 * Shared by ActiveWorkout's save guard and SetRow's disabled state so the
 * button and the handler can't disagree.
 */
export function canSaveSet(set, type) {
  if (!usesReps(type)) return !isBlank(set.duration_seconds) && Number(set.duration_seconds) >= 1
  if (isBlank(set.reps) || Number(set.reps) < 1) return false

  // Added weight is optional; when given it still can't be negative.
  if (isBlank(set.weight)) return !requiresWeight(type)
  return Number(set.weight) >= 0
}

/** "1:30" / "45s" for a duration in seconds. */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  if (total < 60) return `${total}s`

  const minutes = Math.floor(total / 60)
  const remainder = total % 60
  return remainder === 0 ? `${minutes}m` : `${minutes}:${String(remainder).padStart(2, '0')}`
}
