<script setup>
import { computed } from 'vue'
import { useWorkoutStore } from '../stores/workout'

const workoutStore = useWorkoutStore()

const formattedTime = computed(() => {
  const m = Math.floor(workoutStore.restTimeLeft / 60)
  const s = workoutStore.restTimeLeft % 60
  return `${m}:${s.toString().padStart(2, '0')}`
})
</script>

<template>
  <Transition name="timer-pop">
    <div v-if="workoutStore.isResting" class="rest-timer-overlay">
      <div class="rest-timer-content">
        <div class="rest-label">Rest Timer</div>
        <div class="rest-time">{{ formattedTime }}</div>
        <div class="rest-timer-actions">
          <button class="rest-btn rest-btn--extend tap-target" @click="workoutStore.extendRestTimer(30)">+30s</button>
          <button class="rest-btn rest-btn--skip tap-target" @click="workoutStore.stopRestTimer">Skip</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.rest-timer-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
}

/* Both buttons sit on the lime accent pill, so they're styled dark-on-lime and
   share one size for a consistent pair. */
.rest-btn {
  height: 36px;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.2s ease, transform 0.15s ease;
}

.rest-btn:active {
  transform: scale(0.96);
}

/* +30s — outlined on the pill */
.rest-btn--extend {
  background-color: rgba(0, 0, 0, 0.06);
  color: #000;
  border: 1px solid rgba(0, 0, 0, 0.25);
}

.rest-btn--extend:active {
  background-color: rgba(0, 0, 0, 0.16);
}

/* Skip — solid dark, the dismissing action */
.rest-btn--skip {
  background-color: #000;
  color: var(--primary-accent);
  border: 1px solid #000;
}

.rest-btn--skip:active {
  background-color: #1a1a1a;
}

@media (hover: hover) {
  .rest-btn--extend:hover {
    background-color: rgba(0, 0, 0, 0.14);
  }

  .rest-btn--skip:hover {
    background-color: #1a1a1a;
  }
}
</style>
