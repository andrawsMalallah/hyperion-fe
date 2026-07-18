<script setup>
import { computed } from 'vue'
import PrimaryButton from './PrimaryButton.vue'
import { WEIGHTED, canSaveSet, requiresWeight, usesReps } from '../utils/measurement'

// One logged set inside an exercise card mid-workout: the warm-up toggle, the
// value inputs, and the save / edit / remove actions.
//
// Which inputs appear depends on the exercise's measurement type: weight x reps,
// reps with optional added weight, or a hold in seconds.
//
// `set` is the parent's reactive session row and is bound with v-model here, so
// typing writes straight back to the session the parent saves. The parent stays
// the owner of what save/edit/remove actually do — this only reports them.
const props = defineProps({
  set: {
    type: Object,
    required: true
  },
  // Zero-based position in the exercise, shown as the 1-based set number.
  index: {
    type: Number,
    required: true
  },
  weightUnit: {
    type: String,
    required: true
  },
  measurement: {
    type: String,
    default: WEIGHTED
  }
})

defineEmits(['toggle-warmup', 'save', 'edit', 'remove'])

const isTimed = computed(() => !usesReps(props.measurement))

// Bodyweight sets show a weight box too, but it's optional added load — the
// placeholder says so rather than naming the unit alone.
const weightPlaceholder = computed(() =>
  requiresWeight(props.measurement) ? props.weightUnit : `+${props.weightUnit}`
)

const canSave = computed(() => canSaveSet(props.set, props.measurement))
</script>

<template>
  <div class="set-row" :class="{ 'is-completed': set.completed, 'is-warmup': set.set_type === 'warmup' }">
    <button
      class="set-col num-col warmup-toggle"
      :class="{ 'warmup-toggle--on': set.set_type === 'warmup' }"
      :disabled="set.completed"
      @click="$emit('toggle-warmup')"
      :title="set.set_type === 'warmup' ? 'Warm-up set (tap for working set)' : 'Tap to mark as warm-up set'"
      :aria-label="`Set ${index + 1}: toggle warm-up`"
    >
      {{ set.set_type === 'warmup' ? 'W' : index + 1 }}
    </button>
    <!-- Timed exercises take a single duration box in place of weight + reps. -->
    <div v-if="isTimed" class="set-col set-col-wide">
      <input
        type="number"
        inputmode="numeric"
        class="input-large set-input"
        v-model="set.duration_seconds"
        placeholder="Seconds"
        :aria-label="`Set ${index + 1} duration in seconds`"
        min="1"
        :disabled="set.completed"
      />
    </div>
    <template v-else>
      <div class="set-col">
        <input
          type="number"
          inputmode="decimal"
          class="input-large set-input"
          v-model="set.weight"
          :placeholder="weightPlaceholder"
          :aria-label="requiresWeight(measurement)
            ? `Set ${index + 1} weight (${weightUnit})`
            : `Set ${index + 1} added weight (${weightUnit}, optional)`"
          min="0"
          :disabled="set.completed"
        />
      </div>
      <div class="set-col">
        <input
          type="number"
          inputmode="numeric"
          class="input-large set-input"
          v-model="set.reps"
          placeholder="Reps"
          :aria-label="`Set ${index + 1} reps`"
          min="1"
          :disabled="set.completed"
        />
      </div>
    </template>
    <div class="set-col rpe-col">
      <input
        type="number"
        inputmode="numeric"
        class="input-large set-input"
        v-model="set.rpe"
        placeholder="RPE"
        :aria-label="`Set ${index + 1} RPE (optional, 1-10)`"
        min="1"
        max="10"
        :disabled="set.completed"
      />
    </div>
    <div class="set-col action-col flex-row action-col-flex">
      <!-- Edit Button -->
      <PrimaryButton
        v-if="set.completed"
        class="btn-set-action"
        @click="$emit('edit')"
        title="Edit Set"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      </PrimaryButton>

      <!-- Save Button -->
      <PrimaryButton
        v-else
        class="save-set-btn btn-set-action"
        :disabled="!canSave"
        @click="$emit('save')"
        title="Save Set"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </PrimaryButton>

      <!-- Delete Button -->
      <button
        class="btn-danger tap-target remove-set-btn btn-set-action"
        @click="$emit('remove')"
        title="Remove Set"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* .set-row / .set-col / .set-input / .btn-set-action are global (style.css);
   only the warm-up treatment was ever local to this row. */
.warmup-toggle {
  background: none;
  border: 1px dashed transparent;
  border-radius: 6px;
  color: inherit;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  padding: 4px 0;
}

.warmup-toggle:not(:disabled):hover {
  border-color: var(--border-color);
}

.warmup-toggle--on {
  color: #f9ca24;
}

.set-row.is-warmup .set-input {
  opacity: 0.85;
}

/* A timed set has one input where a weighted one has two, so it takes both
   columns' width — keeping every set row the same shape down the card. */
.set-col-wide {
  flex: 2;
}
</style>
