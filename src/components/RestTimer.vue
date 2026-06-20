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
        <button class="btn-danger tap-target" @click="workoutStore.stopRestTimer">Skip</button>
      </div>
    </div>
  </Transition>
</template>
