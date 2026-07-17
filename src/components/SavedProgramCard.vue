<script setup>
import PrimaryButton from './PrimaryButton.vue'

// One saved (inactive) program card on the Home dashboard, with its own
// expand/collapse animation. Presentational: the parent owns expansion state
// (which card is open) and every action, so this only emits. The card
// container classes (.Program-card, .Program-card-header) are global in
// style.css — shared with Home's loading skeleton so the two can't drift.
const props = defineProps({
  program: { type: Object, required: true },
  days: { type: Array, default: () => [] },
  expanded: { type: Boolean, default: false },
  duplicatingProgramId: { type: [Number, String], default: null },
})

defineEmits(['toggle', 'makeActive', 'edit', 'export', 'duplicate'])

function getExerciseCount(day) {
  return day.exercises.length
}

// Height/opacity animation for the expanding day list. Kept as JS hooks because
// the target height is dynamic (scrollHeight), which CSS transitions can't reach.
function beforeEnter(el) {
  el.style.height = '0'
  el.style.opacity = '0'
  el.style.transform = 'translateY(-8px)'
  el.style.overflow = 'hidden'
}

function enter(el, done) {
  el.offsetHeight // force reflow
  el.style.transition = 'height 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s ease, transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
  el.style.height = el.scrollHeight + 'px'
  el.style.opacity = '1'
  el.style.transform = 'translateY(0)'
  el.addEventListener('transitionend', done, { once: true })
}

function afterEnter(el) {
  el.style.height = 'auto'
  el.style.overflow = ''
  el.style.transition = ''
}

function beforeLeave(el) {
  el.style.height = el.scrollHeight + 'px'
  el.style.overflow = 'hidden'
  el.offsetHeight // force reflow
}

function leave(el, done) {
  el.style.transition = 'height 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.25s ease, transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
  el.style.height = '0'
  el.style.opacity = '0'
  el.style.transform = 'translateY(-8px)'
  el.addEventListener('transitionend', done, { once: true })
}
</script>

<template>
  <div class="Program-card card" :class="{ 'is-expanded': expanded }" @click="$emit('toggle', program.id)">
    <div class="Program-card-header">
      <h3 class="Program-title">{{ program.name }}</h3>
      <span class="expand-hint">{{ days.length }} days</span>
    </div>

    <Transition
      name="Program-expand"
      @before-enter="beforeEnter"
      @enter="enter"
      @after-enter="afterEnter"
      @before-leave="beforeLeave"
      @leave="leave"
    >
      <div v-if="expanded" class="days-list" @click.stop>
        <div v-for="(day, idx) in days" :key="day.id" class="day-row" :style="{ transitionDelay: idx * 40 + 'ms' }">
          <div class="day-info">
            <span class="day-name">{{ day.day_name }}</span>
            <span class="day-exercises">{{ getExerciseCount(day) }} exercises</span>
          </div>
        </div>

        <div v-if="days.length === 0" class="empty-state empty-days-hint py-8 text-center" style="border: 1px dashed var(--border-color); border-radius: 8px; font-size: 13px;">
          No days added yet.
        </div>

        <!-- Two-tier action layout: the hero action (Make Active) gets a
             full-width primary button on its own, then the three utilities
             share a row as consistent icon+label buttons. This replaced an
             earlier single row where Duplicate had to be icon-only just to fit
             a narrow phone alongside three text buttons. -->
        <div class="program-card-actions mt-16">
          <PrimaryButton class="program-card-primary h-36" @click="$emit('makeActive', program.id)">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Make Active</span>
          </PrimaryButton>

          <div class="program-card-util-row">
            <button class="btn-secondary tap-target h-36 program-card-util-btn" @click="$emit('edit', program.id)">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              <span>Edit</span>
            </button>

            <button class="btn-secondary tap-target h-36 program-card-util-btn" @click="$emit('export', program.id)">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Export</span>
            </button>

            <button
              class="btn-secondary tap-target h-36 program-card-util-btn"
              @click="$emit('duplicate', program.id)"
              :disabled="duplicatingProgramId === program.id"
              aria-label="Duplicate program"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>{{ duplicatingProgramId === program.id ? 'Copying…' : 'Duplicate' }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.Program-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.expand-hint {
  font-size: 13px;
  color: var(--text-secondary);
}

.days-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.day-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.15);
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.day-info {
  display: flex;
  flex-direction: column;
}

.day-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.day-exercises {
  font-size: 12px;
  color: var(--text-secondary);
}

/* Hero + utilities: the primary action stacks above a row of three equal
   utility buttons. */
.program-card-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Make Active spans the full card width and carries a leading check icon. */
.program-card-primary {
  width: 100%;
  gap: 8px;
  font-size: 14px;
}

.program-card-util-row {
  display: flex;
  flex-direction: row;
  gap: 8px;
}

/* Edit / Export / Duplicate: equal thirds, each icon + label so nothing is a
   mystery icon. Tight horizontal padding keeps the labels on one line at 360px. */
.program-card-util-btn {
  flex: 1;
  min-width: 0;
  gap: 6px;
  padding-left: 6px;
  padding-right: 6px;
  font-size: 13px;
}

/* Icons must not shrink when a label is long (e.g. "Duplicate"). */
.program-card-util-btn svg,
.program-card-primary svg {
  flex-shrink: 0;
}

.h-36 {
  height: 36px !important;
  min-height: 36px !important;
}

.px-16 {
  padding-left: 16px !important;
  padding-right: 16px !important;
}
</style>
