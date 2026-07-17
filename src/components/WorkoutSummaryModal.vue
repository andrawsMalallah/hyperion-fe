<script setup>
import AppModal from './AppModal.vue'
import { useWorkoutStore } from '../stores/workout'
import { formatWeight } from '../utils/units'

// The post-save summary — duration / sets / volume, any PRs, and a notes box.
// Doubles as the celebration screen. Purely presentational: the workout is
// already saved (or queued offline) by the time this shows, so the parent owns
// what dismissal actually does.
defineProps({
  show: Boolean,
  // { durationMs, sets, volume, prs[] } — see ActiveWorkout's saveWorkout.
  summary: {
    type: Object,
    default: null
  },
  offline: Boolean,
  notes: {
    type: String,
    default: ''
  }
})

defineEmits(['update:notes', 'dismiss'])

const workoutStore = useWorkoutStore()

// Duration as "1h 12m" / "34m" / "45s".
function formatDuration(ms) {
  const totalSec = Math.round((ms || 0) / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}

// Total volume in the user's unit, compactly (e.g. "12,340 kg").
function formatVolume(volumeKg) {
  const v = Math.round(Number(formatWeight(volumeKg, workoutStore.weightUnit)))
  return `${v.toLocaleString()} ${workoutStore.weightUnit}`
}
</script>

<template>
  <AppModal
    :show="show"
    :title="offline ? 'Saved Offline' : 'Workout Complete'"
    confirm-text="Go Home"
    hide-cancel
    @confirm="$emit('dismiss')"
    @update:show="(v) => { if (!v) $emit('dismiss') }"
  >
    <div class="ws-summary" v-if="summary">
      <p v-if="offline" class="ws-offline-note">
        Saved offline — it'll sync automatically when you're back online.
      </p>

      <div class="ws-stats">
        <div class="ws-stat">
          <span class="ws-stat-value">{{ formatDuration(summary.durationMs) }}</span>
          <span class="ws-stat-label">Duration</span>
        </div>
        <div class="ws-stat">
          <span class="ws-stat-value">{{ summary.sets }}</span>
          <span class="ws-stat-label">Sets</span>
        </div>
        <div class="ws-stat">
          <span class="ws-stat-value">{{ formatVolume(summary.volume) }}</span>
          <span class="ws-stat-label">Volume</span>
        </div>
      </div>

      <div v-if="summary.prs && summary.prs.length" class="ws-prs">
        <div class="ws-prs-title">🎉 New personal records</div>
        <ul class="ws-pr-list">
          <li v-for="pr in summary.prs" :key="pr.exercise_id" class="ws-pr-item">
            <span class="ws-pr-name">{{ pr.exerciseName }}</span>
            <span class="ws-pr-lift">{{ formatWeight(pr.weight, workoutStore.weightUnit) }}{{ workoutStore.weightUnit }} × {{ pr.reps }}</span>
          </li>
        </ul>
      </div>

      <div class="ws-notes">
        <label for="ws-notes-input" class="ws-notes-label">Notes (optional)</label>
        <textarea
          id="ws-notes-input"
          :value="notes"
          @input="$emit('update:notes', $event.target.value)"
          class="ws-notes-input"
          rows="3"
          maxlength="1000"
          placeholder="How did it go? Aches, PRs, form cues…"
        ></textarea>
      </div>
    </div>
  </AppModal>
</template>

<style scoped>
.ws-summary {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ws-offline-note {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-secondary);
}

.ws-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.ws-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 8px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  text-align: center;
}

.ws-stat-value {
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary, #fff);
  line-height: 1.1;
}

.ws-stat-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}

.ws-prs {
  padding: 14px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background-color: var(--bg-surface);
}

.ws-notes {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ws-notes-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}

.ws-notes-input {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 68px;
  padding: 10px 12px;
  font: inherit;
  font-size: 14px;
  line-height: 1.4;
  color: var(--text-primary);
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.ws-notes-input:focus {
  outline: none;
  border-color: var(--primary-accent);
}

.ws-notes-input::placeholder {
  color: var(--text-secondary);
}

.ws-prs-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--primary-accent);
  margin-bottom: 12px;
}

.ws-pr-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ws-pr-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.ws-pr-name {
  font-size: 14px;
  font-weight: 700;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-pr-lift {
  flex: 0 0 auto;
  font-size: 14px;
  font-weight: 800;
  color: var(--primary-accent);
  white-space: nowrap;
}

@media (max-width: 340px) {
  .ws-stat-value {
    font-size: 16px;
  }
  .ws-stat {
    padding: 12px 4px;
  }
}
</style>
