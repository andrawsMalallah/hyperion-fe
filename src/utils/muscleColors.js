// One badge color per canonical muscle group (matches the seeded taxonomy).
const MUSCLE_COLORS = {
  Chest: '#ff6b6b',
  Back: '#45b7d1',
  Legs: '#4ecdc4',
  Shoulders: '#f9ca24',
  Biceps: '#ff9ff3',
  Triceps: '#feca57',
  Forearms: '#1dd1a1',
  Core: '#2bcbba',
  'Full Body': '#8854d0'
}

export function muscleGroupColor(group) {
  return MUSCLE_COLORS[group] || '#AAAAAA'
}
