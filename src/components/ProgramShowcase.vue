<script setup>
import PrimaryButton from './PrimaryButton.vue'

// The active-program card on the Home dashboard. Purely presentational: the
// parent owns the router pushes, store calls and the in-progress-switch modal,
// so every action is emitted rather than handled here. Layout container classes
// (.active-Program-showcase, .showcase-header, .showcase-days-list,
// .showcase-day-row, .day-details) are global in style.css — shared with Home's
// loading skeleton so the two can't drift.
const props = defineProps({
  program: { type: Object, required: true },
  days: { type: Array, default: () => [] },
  nextUpDayId: { type: [Number, String], default: null },
  duplicatingProgramId: { type: [Number, String], default: null },
})

defineEmits(['start', 'export', 'duplicate', 'edit'])

function getExerciseCount(day) {
  return day.exercises.length
}
</script>

<template>
  <div class="active-Program-showcase card">
    <div class="showcase-header">
      <h3 class="showcase-title">{{ program.name }}</h3>
      <div class="showcase-header-actions">
        <button
          class="btn-secondary tap-target edit-shortcut-btn"
          @click="$emit('export', program.id)"
          title="Export Program"
          aria-label="Export program to a file"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </button>
        <button
          class="btn-secondary tap-target edit-shortcut-btn"
          @click="$emit('duplicate', program.id)"
          :disabled="duplicatingProgramId === program.id"
          title="Duplicate Program"
          aria-label="Duplicate program"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
        <button class="btn-secondary tap-target edit-shortcut-btn" @click="$emit('edit', program.id)" title="Edit Program" aria-label="Edit program">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
      </div>
    </div>

    <div class="showcase-days-list mt-16">
      <div v-for="day in days" :key="day.id" class="showcase-day-row">
        <div class="day-details">
          <span class="showcase-day-name">
            {{ day.day_name }}
            <span v-if="day.id === nextUpDayId" class="next-up-badge">Up next</span>
          </span>
          <span class="showcase-day-exercises">{{ getExerciseCount(day) }} exercises</span>
        </div>
        <PrimaryButton class="showcase-start-btn" @click="$emit('start', day.id)">
          <span>Start</span>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </PrimaryButton>
      </div>

      <div v-if="days.length === 0" class="empty-state text-center py-16" style="border: 1px dashed var(--border-color); border-radius: 8px;">
        No days added to this program yet. Click edit shortcut to build it.
      </div>
    </div>
  </div>
</template>

<style scoped>
.showcase-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  color: var(--primary-accent);
}

.showcase-header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.edit-shortcut-btn {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  min-height: 36px !important;
  border-radius: 8px !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center;
  justify-content: center;
}

.showcase-day-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.next-up-badge {
  background-color: rgba(204, 255, 0, 0.12);
  color: var(--primary-accent);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 8px;
  border-radius: 10px;
}

.showcase-day-exercises {
  font-size: 13px;
  color: var(--text-secondary);
}

.showcase-start-btn {
  height: 38px !important;
  min-height: 38px !important;
  padding: 0 16px !important;
  font-size: 14px !important;
  border-radius: 8px !important;
  display: inline-flex !important;
  align-items: center;
  gap: 6px;
}

.showcase-start-btn svg {
  transition: transform 0.2s ease;
}

.showcase-start-btn:hover svg {
  transform: translateX(2px);
}
</style>
