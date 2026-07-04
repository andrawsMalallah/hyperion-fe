// Training math over workout logs. All weights are canonical kg.

// Epley estimated one-rep max. For a single, the lift is its own max.
export function epley1RM(weightKg, reps) {
  const w = Number(weightKg)
  const r = Number(reps)
  if (!isFinite(w) || !isFinite(r) || w <= 0 || r <= 0) return 0
  return r === 1 ? w : w * (1 + r / 30)
}

const isWorkingSet = s => (s.set_type || 'working') !== 'warmup'

// Best estimated 1RM per session for one exercise, oldest first.
// Shape: [{ date: Date, e1rm, weight, reps }]
export function e1rmHistory(logs, exerciseId) {
  const points = []
  for (const log of logs) {
    if (!log.sets) continue
    let best = null
    for (const s of log.sets) {
      if (s.exercise_id !== exerciseId || !isWorkingSet(s)) continue
      const e1rm = epley1RM(s.weight, s.reps)
      if (!best || e1rm > best.e1rm) {
        best = { e1rm, weight: Number(s.weight), reps: Number(s.reps) }
      }
    }
    if (best) {
      points.push({ date: new Date(log.date_timestamp), ...best })
    }
  }
  return points.sort((a, b) => a.date - b.date)
}

// Total working-set volume (kg) grouped by ISO week, most recent `weeks`
// entries, oldest first. Shape: [{ weekStart: Date, volume }]
export function weeklyVolume(logs, weeks = 8) {
  const byWeek = new Map()
  for (const log of logs) {
    if (!log.sets) continue
    const d = new Date(log.date_timestamp)
    const monday = new Date(d)
    monday.setHours(0, 0, 0, 0)
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    const key = monday.getTime()
    const volume = log.sets.reduce(
      (acc, s) => acc + (isWorkingSet(s) ? Number(s.weight) * Number(s.reps) : 0),
      0
    )
    byWeek.set(key, (byWeek.get(key) || 0) + volume)
  }
  return [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-weeks)
    .map(([ts, volume]) => ({ weekStart: new Date(ts), volume }))
}

// Compare a just-finished workout's sets against each exercise's prior best
// estimated 1RM and return the exercises where a new best was hit.
// `previousBestByExercise` maps exercise_id -> prior best e1rm (0/absent means
// no history, which never counts as a PR).
// Shape: [{ exercise_id, e1rm, weight, reps, previousBest }]
export function detectPRs(previousBestByExercise, newSets) {
  const bestNew = new Map()
  for (const s of newSets) {
    if (!isWorkingSet(s)) continue
    const e1rm = epley1RM(s.weight, s.reps)
    if (e1rm <= 0) continue
    const current = bestNew.get(s.exercise_id)
    if (!current || e1rm > current.e1rm) {
      bestNew.set(s.exercise_id, { exercise_id: s.exercise_id, e1rm, weight: Number(s.weight), reps: Number(s.reps) })
    }
  }

  const prs = []
  for (const [exerciseId, candidate] of bestNew) {
    const previousBest = Number(previousBestByExercise?.[exerciseId] ?? 0)
    if (previousBest > 0 && candidate.e1rm > previousBest) {
      prs.push({ ...candidate, previousBest })
    }
  }
  return prs
}
