// Weights are stored canonically in kilograms; the user's unit setting
// only affects display and input interpretation.
export const KG_PER_LB = 0.45359237

export function toKg(value, unit) {
  const n = Number(value)
  if (!isFinite(n)) return 0
  return unit === 'lbs' ? n * KG_PER_LB : n
}

export function fromKg(kg, unit) {
  const n = Number(kg)
  if (!isFinite(n)) return 0
  return unit === 'lbs' ? n / KG_PER_LB : n
}

// Round to one decimal and drop a trailing ".0" for clean display.
export function formatWeight(kg, unit) {
  const v = Math.round(fromKg(kg, unit) * 10) / 10
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}
