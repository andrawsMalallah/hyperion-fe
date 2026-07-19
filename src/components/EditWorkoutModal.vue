<script setup>
import { ref, watch, computed } from 'vue'
import AppModal from './AppModal.vue'
import PrimaryButton from './PrimaryButton.vue'
import PendingLabel from './PendingLabel.vue'
import { useHistoryStore } from '../stores/history'
import { useToastStore } from '../stores/toast'
import { toKg, fromKg } from '../utils/units'
import { canSaveSet, measurementOf, requiresWeight, usesReps } from '../utils/measurement'

const props = defineProps({
  show: Boolean,
  // The raw workout log (with grouped `sets`, each carrying its `exercise`).
  workout: { type: Object, default: null },
  weightUnit: { type: String, default: 'kg' }
})

const emit = defineEmits(['update:show', 'saved'])

const historyStore = useHistoryStore()
const toast = useToastStore()

// Editable working copy: exercises in first-seen order, each with its sets in
// set_order. Weights are shown in the user's unit; converted back to kg on save.
const groups = ref([])
const notes = ref('')
const saving = ref(false)

// A number shown for editing, empty string stays empty (never "0").
function weightForInput(kg) {
  const v = Math.round(fromKg(kg, props.weightUnit) * 100) / 100
  return String(v)
}

function buildGroups(workout) {
  const map = new Map()
  const sets = [...(workout?.sets || [])].sort((a, b) => a.set_order - b.set_order)
  for (const s of sets) {
    if (!map.has(s.exercise_id)) {
      map.set(s.exercise_id, {
        exerciseId: s.exercise_id,
        exerciseName: s.exercise ? s.exercise.name : 'Unknown Exercise',
        measurement: measurementOf(s.exercise),
        sets: []
      })
    }
    map.get(s.exercise_id).sets.push({
      weight: weightForInput(s.weight),
      reps: s.reps != null ? String(s.reps) : '',
      duration_seconds: s.duration_seconds != null ? String(s.duration_seconds) : '',
      rpe: s.rpe != null ? String(s.rpe) : '',
      set_type: s.set_type || 'working'
    })
  }
  return Array.from(map.values())
}

// Rebuild the working copy whenever the modal opens for a workout.
watch(() => props.show, (open) => {
  if (open && props.workout) {
    groups.value = buildGroups(props.workout)
    notes.value = props.workout.notes || ''
    saving.value = false
  }
})

const totalSets = computed(() =>
  groups.value.reduce((acc, g) => acc + g.sets.length, 0)
)

function addSet(group) {
  const last = group.sets[group.sets.length - 1]
  group.sets.push(
    last
      ? { ...last }
      : { weight: '', reps: '', duration_seconds: '', rpe: '', set_type: 'working' }
  )
}

function removeSet(group, index) {
  group.sets.splice(index, 1)
}

function toggleWarmup(set) {
  set.set_type = set.set_type === 'warmup' ? 'working' : 'warmup'
}

function close() {
  emit('update:show', false)
}

async function save() {
  if (saving.value) return

  // Flatten to the API shape, assigning a sequential set_order across the
  // grouped order (History regroups by exercise anyway). Weight → kg.
  const flat = []
  for (const g of groups.value) {
    const timed = !usesReps(g.measurement)

    for (const s of g.sets) {
      if (!canSaveSet(s, g.measurement)) {
        toast.error(timed
          ? 'Every timed set needs a duration of at least 1 second.'
          : 'Every set needs a valid weight and at least 1 rep.')
        return
      }
      const rpe = s.rpe === '' || s.rpe === null ? null : parseInt(s.rpe)
      // Blank weight means "no added load" on a bodyweight or timed set.
      const weight = s.weight === '' || s.weight === null ? 0 : Number(s.weight)
      flat.push({
        exercise_id: g.exerciseId,
        weight: Math.round(toKg(weight, props.weightUnit) * 100) / 100,
        // Exactly one of these — the API rejects a set carrying both.
        reps: timed ? null : parseInt(s.reps),
        duration_seconds: timed ? parseInt(s.duration_seconds) : null,
        rpe: Number.isInteger(rpe) ? rpe : null,
        set_type: s.set_type || 'working',
        set_order: flat.length + 1
      })
    }
  }

  if (flat.length === 0) {
    toast.error('A workout must keep at least one set — delete it instead.')
    return
  }

  saving.value = true
  try {
    await historyStore.updateWorkout(props.workout.id, {
      notes: notes.value.trim() || null,
      sets: flat
    })
    toast.success('Workout updated')
    emit('saved')
    close()
  } catch (e) {
    // The interceptor surfaces the server error; keep the modal open to fix it.
    console.error('Failed to update workout:', e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal
    :show="show"
    title="Edit Workout"
    max-width="560px"
    hide-footer
    @update:show="(v) => emit('update:show', v)"
  >
    <div v-if="workout" class="ew-body">
      <div v-for="group in groups" :key="group.exerciseId" class="ew-group">
        <h4 class="ew-ex-name">{{ group.exerciseName }}</h4>

        <div class="ew-set-head">
          <span>Set</span>
          <template v-if="usesReps(group.measurement)">
            <span>{{ requiresWeight(group.measurement) ? weightUnit : `+${weightUnit}` }}</span>
            <span>Reps</span>
          </template>
          <span v-else class="ew-span-2">Seconds</span>
          <span>RPE</span>
          <span></span>
        </div>

        <div v-for="(set, sIdx) in group.sets" :key="sIdx" class="ew-set-row" :class="{ 'is-warmup': set.set_type === 'warmup' }">
          <button
            type="button"
            class="ew-type-btn"
            :class="{ 'ew-type-btn--warmup': set.set_type === 'warmup' }"
            :title="set.set_type === 'warmup' ? 'Warm-up set (tap to make working)' : 'Working set (tap to make warm-up)'"
            @click="toggleWarmup(set)"
          >{{ set.set_type === 'warmup' ? 'W' : (sIdx + 1) }}</button>
          <template v-if="usesReps(group.measurement)">
            <input v-model="set.weight" type="number" inputmode="decimal" min="0" step="0.5" class="ew-input" />
            <input v-model="set.reps" type="number" inputmode="numeric" min="1" step="1" class="ew-input" />
          </template>
          <input
            v-else
            v-model="set.duration_seconds"
            type="number"
            inputmode="numeric"
            min="1"
            step="1"
            class="ew-input ew-span-2"
          />
          <input v-model="set.rpe" type="number" inputmode="numeric" min="1" max="10" step="1" class="ew-input" placeholder="–" />
          <button type="button" class="ew-remove" title="Remove set" @click="removeSet(group, sIdx)" aria-label="Remove set">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <button type="button" class="ew-add" @click="addSet(group)">+ Add set</button>
      </div>

      <div class="ew-notes">
        <label for="ew-notes-input" class="ew-notes-label">Notes (optional)</label>
        <textarea
          id="ew-notes-input"
          v-model="notes"
          class="ew-notes-input"
          rows="3"
          maxlength="1000"
          placeholder="How did it go?"
        ></textarea>
      </div>

      <div class="ew-footer">
        <button type="button" class="btn-secondary tap-target ew-cancel" @click="close">Cancel</button>
        <PrimaryButton class="ew-save" :disabled="saving || totalSets === 0" @click="save">
          <PendingLabel v-if="saving" text="Saving" />
          <template v-else>Save changes</template>
        </PrimaryButton>
      </div>
    </div>
  </AppModal>
</template>

<style scoped>
.ew-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.ew-group {
  background-color: rgba(255, 255, 255, 0.01);
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--primary-accent);
  border-radius: 8px;
  padding: 12px 14px;
}

.ew-ex-name {
  margin: 0 0 10px 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.ew-set-head,
.ew-set-row {
  display: grid;
  grid-template-columns: 34px 1fr 1fr 1fr 30px;
  gap: 8px;
  align-items: center;
}

.ew-set-head {
  margin-bottom: 6px;
  padding: 0 2px;
}

/* A timed set has one value where a weighted one has two (weight + reps), so
   its input takes both tracks and the row keeps the same column alignment. */
.ew-span-2 {
  grid-column: span 2;
}

.ew-set-head span {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  text-align: center;
}

.ew-set-head span:first-child {
  text-align: left;
}

.ew-set-row {
  margin-bottom: 8px;
}

.ew-type-btn {
  height: 36px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background-color: rgba(204, 255, 0, 0.06);
  color: var(--primary-accent);
  font-weight: 800;
  font-size: 13px;
  cursor: pointer;
}

.ew-type-btn--warmup {
  background-color: rgba(249, 202, 36, 0.1);
  color: #f9ca24;
}

.ew-input {
  width: 100%;
  box-sizing: border-box;
  height: 36px;
  text-align: center;
  padding: 0 4px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.ew-input:focus {
  outline: none;
  border-color: var(--primary-accent);
}

.ew-set-row.is-warmup .ew-input {
  opacity: 0.85;
}

.ew-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 36px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px;
}

.ew-remove:hover {
  color: var(--danger, #ff5252);
}

.ew-add {
  width: 100%;
  margin-top: 2px;
  padding: 8px;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}

.ew-add:hover {
  color: var(--primary-accent);
  border-color: var(--primary-accent);
}

.ew-notes {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ew-notes-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}

.ew-notes-input {
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

.ew-notes-input:focus {
  outline: none;
  border-color: var(--primary-accent);
}

.ew-footer {
  display: flex;
  gap: 12px;
}

.ew-cancel {
  flex: 1;
  min-height: 44px;
  padding: 0 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ew-save {
  flex: 1;
  min-height: 44px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
