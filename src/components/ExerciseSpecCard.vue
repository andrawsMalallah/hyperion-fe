<script setup>
import { computed } from 'vue'
import { muscleGroupColor } from '../utils/muscleColors'
import {
  TYPE_OPTIONS,
  GROUP_SIZES,
  SUPERSET,
  isGroupType,
  isTagType,
  typeLabel,
  typeOf,
  groupKeyOf,
  groupMembers,
  groupLetter
} from '../utils/grouping'

// One exercise inside a day in the Program Builder: header, targets strip, and
// the expandable prescription editor (including the grouping member list).
//
// ⚠️ Reads vs writes — the invariant this component is built around:
// `day` is a localDays entry, whose `prescriptions` object is shared BY
// REFERENCE with the parent's draft. So everything derived below reads `day`
// safely, and the editor's v-model writes through to the draft. But anything
// that must CREATE a prescription, or retype a whole group, is emitted for the
// parent to do via draftDay() — a brand-new prescription written here would
// land on the copy and silently never save.
const props = defineProps({
  // A localDays entry: { id, exerciseObjects[], prescriptions{} }.
  day: {
    type: Object,
    required: true
  },
  // The exercise being rendered, from day.exerciseObjects.
  element: {
    type: Object,
    required: true
  },
  index: {
    type: Number,
    required: true
  },
  // Whether the prescription editor is open (the parent owns the expanded set).
  expanded: Boolean
})

defineEmits(['move-up', 'move-down', 'remove', 'toggle-rx', 'set-type', 'toggle-group-member', 'dirty'])

const isLast = computed(() => props.index === props.day.exerciseObjects.length - 1)

const rx = computed(() => props.day.prescriptions?.[props.element.id])

const exerciseType = computed(() => typeOf(props.day, props.element.id))

const railColor = computed(() => muscleGroupColor(props.element.target_muscle_group))

function rxSummary() {
  const value = rx.value
  if (!value) return ''
  const parts = []
  if (value.target_sets) {
    let reps = ''
    if (value.rep_range_min && value.rep_range_max) reps = `×${value.rep_range_min}-${value.rep_range_max}`
    else if (value.rep_range_min) reps = `×${value.rep_range_min}+`
    parts.push(`${value.target_sets}${reps}`)
  } else if (value.rep_range_min && value.rep_range_max) {
    parts.push(`${value.rep_range_min}-${value.rep_range_max} reps`)
  }
  if (value.target_rpe) parts.push(`@${value.target_rpe}`)
  if (value.rest_seconds) parts.push(`${value.rest_seconds}s rest`)
  return parts.join(' · ')
}

// Whether the targets strip has anything to show — a bare type counts, so a
// drop set with no numbers still reads as configured rather than empty.
const hasAnyRx = computed(() => !!(rxSummary() || exerciseType.value))

// Structured version of the prescription, one value per target chip.
const chips = computed(() => {
  const value = rx.value || {}
  let reps = ''
  if (value.rep_range_min && value.rep_range_max) reps = `${value.rep_range_min}–${value.rep_range_max}`
  else if (value.rep_range_min) reps = `${value.rep_range_min}+`
  let setsReps = ''
  if (value.target_sets && reps) setsReps = `${value.target_sets} × ${reps}`
  else if (value.target_sets) setsReps = `${value.target_sets} sets`
  else if (reps) setsReps = `${reps} reps`
  return {
    setsReps,
    rpe: value.target_rpe || '',
    rest: value.rest_seconds ? `${value.rest_seconds}s` : ''
  }
})

const groupBadge = computed(() => {
  if (!isGroupType(exerciseType.value)) return ''
  return `${typeLabel(exerciseType.value)} ${groupLetter(props.day, groupKeyOf(props.day, props.element.id))}`.trim()
})

// The group is edited on its first member, so the checkbox list appears once
// rather than on every card in the group.
const isGroupAnchor = computed(() => {
  const key = groupKeyOf(props.day, props.element.id)
  if (key === null || !isGroupType(exerciseType.value)) return false
  return groupMembers(props.day, key)[0] === props.element.id
})

const otherExercises = computed(() =>
  props.day.exerciseObjects.filter(e => e.id !== props.element.id)
)

const anchorName = computed(() => {
  const anchorId = groupMembers(props.day, groupKeyOf(props.day, props.element.id))[0]
  return props.day.exerciseObjects.find(e => e.id === anchorId)?.name || 'the first exercise'
})

function isInGroupWith(otherId) {
  const key = groupKeyOf(props.day, props.element.id)
  return key !== null && groupKeyOf(props.day, otherId) === key
}

// Live feedback under the checkbox list, so a group that's the wrong size is
// obvious while building it instead of on save.
const groupStatus = computed(() => {
  const type = exerciseType.value
  const count = groupMembers(props.day, groupKeyOf(props.day, props.element.id)).length
  const { min, max } = GROUP_SIZES[type] || {}
  if (!min) return null

  if (count < min) {
    const needed = min - count
    return {
      ok: false,
      text: type === SUPERSET
        ? 'Pick 1 more exercise — a superset joins exactly 2.'
        : `Pick ${needed} more — a giant set joins at least 3.`
    }
  }
  if (max !== null && max !== undefined && count > max) {
    return { ok: false, text: 'A superset joins exactly 2. Use a giant set for 3 or more.' }
  }
  return { ok: true, text: `${count} exercises joined — rest starts after the last one.` }
})
</script>

<template>
  <div class="ex-card" :class="{ 'ex-card--editing': expanded }" :style="{ '--muscle': railColor }">

    <!-- Header: index · name + muscle · reorder + actions -->
    <div class="ex-card-head">
      <span class="ex-index">{{ index + 1 }}</span>

      <div class="ex-title">
        <span class="ex-card-name">{{ element.name }}</span>
        <span class="ex-muscle" v-if="element.target_muscle_group">
          {{ element.target_muscle_group }}
        </span>
      </div>

      <span class="ex-group-badge" v-if="groupBadge">{{ groupBadge }}</span>

      <div class="ex-reorder">
        <button class="ex-move" :disabled="index === 0" @click="$emit('move-up')" title="Move Up"
          aria-label="Move up">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
            stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
        <button class="ex-move" :disabled="isLast" @click="$emit('move-down')" title="Move Down"
          aria-label="Move down">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
            stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>

      <button class="ex-remove" @click="$emit('remove')" title="Remove Exercise"
        aria-label="Remove exercise">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <!-- Targets strip: chips when set, or an "add targets" prompt -->
    <div class="ex-targets">
      <template v-if="hasAnyRx">
        <!-- Grouping types are already named by the header badge, so only the
             tag types need a chip here. -->
        <span class="target-chip" v-if="isTagType(exerciseType)">
          <span class="chip-val">{{ typeLabel(exerciseType) }}</span>
          <span class="chip-key">type</span>
        </span>
        <span class="target-chip" v-if="chips.setsReps">
          <span class="chip-val">{{ chips.setsReps }}</span>
          <span class="chip-key">sets × reps</span>
        </span>
        <span class="target-chip" v-if="chips.rpe">
          <span class="chip-val">@{{ chips.rpe }}</span>
          <span class="chip-key">RPE</span>
        </span>
        <span class="target-chip" v-if="chips.rest">
          <span class="chip-val">{{ chips.rest }}</span>
          <span class="chip-key">rest</span>
        </span>
        <button class="target-edit" @click="$emit('toggle-rx')"
          :class="{ 'target-edit--active': expanded }"
          :aria-expanded="expanded">
          {{ expanded ? 'Done' : 'Edit targets' }}
        </button>
      </template>
      <button v-else class="target-add" @click="$emit('toggle-rx')" :aria-expanded="expanded">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
          stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        Set targets
      </button>
    </div>

    <!-- Editor — always mounted; height animates via grid-rows so it opens AND
         closes smoothly with no re-render pop. -->
    <div class="rx-collapse" :class="{ 'rx-collapse--open': expanded }">
      <div class="rx-collapse-inner">
        <!-- v-model writes straight into the prescription object, which is
             shared by reference with the parent's draft (see the note above). -->
        <div class="rx-editor" v-if="rx">
          <label class="rx-field">
            <span>Sets</span>
            <input type="number" min="1" max="20"
              v-model.number="rx.target_sets" @input="$emit('dirty')"
              placeholder="3" />
          </label>
          <label class="rx-field">
            <span>Reps min</span>
            <input type="number" min="1" max="100"
              v-model.number="rx.rep_range_min" @input="$emit('dirty')"
              placeholder="8" />
          </label>
          <label class="rx-field">
            <span>Reps max</span>
            <input type="number" min="1" max="100"
              v-model.number="rx.rep_range_max" @input="$emit('dirty')"
              placeholder="12" />
          </label>
          <label class="rx-field">
            <span>RPE</span>
            <input type="number" min="1" max="10"
              v-model.number="rx.target_rpe" @input="$emit('dirty')"
              placeholder="–" />
          </label>
          <label class="rx-field">
            <span>Rest (s)</span>
            <input type="number" min="0" max="600" step="15"
              v-model.number="rx.rest_seconds" @input="$emit('dirty')"
              placeholder="90" />
          </label>
          <!-- Full-width coaching note (spans the whole grid row); shown
               read-only under the exercise on the Active Workout screen. -->
          <label class="rx-field rx-field-notes">
            <span>Notes</span>
            <textarea rows="2" maxlength="500"
              v-model="rx.notes" @input="$emit('dirty')"
              placeholder="Coaching cue — e.g. pause 1s at the bottom, elbows tucked"></textarea>
          </label>

          <!-- How the exercise is performed. Drop/pyramid are tags on this
               exercise alone; superset/giant join it to others, so picking one
               reveals the member list below. -->
          <label class="rx-field rx-field-type">
            <span>Type</span>
            <select :value="exerciseType || ''"
              @change="$emit('set-type', $event.target.value || null)">
              <option value="">None</option>
              <option v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </label>

          <div class="rx-group" v-if="isGroupType(exerciseType)">
            <!-- The group is edited on its first exercise only, so the list
                 appears once instead of on every member. -->
            <template v-if="isGroupAnchor">
              <span class="rx-group-title">
                Performed with — pick
                {{ exerciseType === SUPERSET ? '1 other exercise' : '2 or more others' }}
              </span>
              <div class="rx-group-options" v-if="otherExercises.length">
                <label v-for="other in otherExercises" :key="other.id" class="rx-group-option">
                  <input type="checkbox" :checked="isInGroupWith(other.id)"
                    @change="$emit('toggle-group-member', other.id)" />
                  <span>{{ other.name }}</span>
                </label>
              </div>
              <p class="rx-group-hint" v-else>
                Add another exercise to this day first.
              </p>
              <p class="rx-group-hint" :class="{ 'rx-group-hint--warn': groupStatus && !groupStatus.ok }"
                v-if="groupStatus">
                {{ groupStatus.text }}
              </p>
            </template>
            <p class="rx-group-hint" v-else>
              Part of {{ groupBadge }} — edit the group on {{ anchorName }}.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ===== Exercise card =====================================================
   Each exercise is a self-contained card carrying a left rail tinted with its
   muscle-group color (--muscle, set inline). Three stacked zones: header,
   targets strip, and the expandable editor. Reflows cleanly from phone to
   desktop because everything is intrinsic width + wrap, no fixed columns. */
.ex-card {
  --muscle: var(--border-color);
  position: relative;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 60%),
    var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px 16px 14px 18px;
  margin-bottom: 10px;
  overflow: hidden;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

/* Muscle-group rail */
.ex-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--muscle);
}

.ex-card:hover {
  border-color: #444;
}

.ex-card--editing {
  border-color: rgba(204, 255, 0, 0.35);
  box-shadow: 0 0 0 1px rgba(204, 255, 0, 0.08);
}

/* ---- Header row: index · title/muscle · reorder · remove ---- */
.ex-card-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ex-index {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.ex-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ex-card-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.25;
  overflow-wrap: break-word;
}

.ex-muscle {
  align-self: flex-start;
  max-width: 100%;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--muscle);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Names the group a card belongs to ("Superset A"), so members are readable at
   a glance without opening the editor. */
.ex-group-badge {
  flex-shrink: 0;
  padding: 4px 9px;
  border-radius: 6px;
  border: 1px solid rgba(204, 255, 0, 0.4);
  background: rgba(204, 255, 0, 0.08);
  color: var(--primary-accent);
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.ex-reorder {
  flex-shrink: 0;
  display: flex;
  gap: 4px;
}

.ex-move {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  border: 1px solid var(--border-color);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.ex-move:disabled {
  opacity: 0.2;
  cursor: not-allowed;
}

.ex-remove {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

@media (hover: hover) {
  .ex-move:not(:disabled):hover {
    color: var(--text-primary);
    border-color: #555;
    background: var(--bg-surface-hover);
  }
  .ex-remove:hover {
    color: var(--danger);
    border-color: rgba(255, 77, 77, 0.4);
    background: rgba(255, 77, 77, 0.08);
  }
}

/* ---- Targets strip ---- */
.ex-targets {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.target-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid var(--border-color);
}

.chip-val {
  font-size: 13px;
  font-weight: 800;
  color: var(--primary-accent);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.chip-key {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

/* Edit / add-targets pills */
.target-edit,
.target-add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
}

.target-edit {
  margin-left: auto;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  transition: color 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
}

.target-edit--active {
  border-color: var(--primary-accent);
  color: var(--primary-accent);
}

.target-add {
  border: 1px dashed rgba(204, 255, 0, 0.4);
  background: rgba(204, 255, 0, 0.03);
  color: var(--primary-accent);
}

@media (hover: hover) {
  .target-edit:hover {
    color: var(--text-primary);
    border-color: #555;
  }
  .target-add:hover {
    background: rgba(204, 255, 0, 0.08);
  }
}

/* ---- Editor: labeled numeric grid, 5→3→2 columns ---- */
/* Collapsible wrapper: grid-rows 0fr → 1fr animates height with no JS and no
   unmount, so open and close are both smooth and nothing re-renders mid-edit. */
.rx-collapse {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows 0.28s cubic-bezier(0.25, 0.8, 0.25, 1),
    opacity 0.2s ease;
}

.rx-collapse--open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.rx-collapse-inner {
  overflow: hidden;
  min-height: 0;
}

.rx-editor {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  margin-top: 12px;
  padding: 14px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

@media (max-width: 620px) {
  .rx-editor {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 380px) {
  .rx-editor {
    grid-template-columns: repeat(2, 1fr);
  }
}

.rx-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.rx-field span {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

.rx-field input {
  width: 100%;
  background-color: var(--bg-main);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 7px;
  padding: 9px 8px;
  font-size: 15px;
  font-weight: 700;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.rx-field input:focus {
  outline: none;
  border-color: var(--primary-accent);
}

/* Notes field spans the full editor grid (it's free text, not a numeric cell). */
.rx-field-notes {
  grid-column: 1 / -1;
}

/* Type picker + its group member list both span the editor grid. */
.rx-field-type,
.rx-group {
  grid-column: 1 / -1;
}

.rx-field select {
  width: 100%;
  background-color: var(--bg-main);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 7px;
  padding: 9px 8px;
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
}

.rx-field select:focus {
  outline: none;
  border-color: var(--primary-accent);
}

.rx-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px dashed rgba(204, 255, 0, 0.35);
  border-radius: 8px;
  background: rgba(204, 255, 0, 0.03);
}

.rx-group-title {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

.rx-group-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.rx-group-option {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-main);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
}

.rx-group-option input {
  accent-color: var(--primary-accent);
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.rx-group-option:has(input:checked) {
  border-color: var(--primary-accent);
  background: rgba(204, 255, 0, 0.08);
}

.rx-group-hint {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  line-height: 1.4;
}

.rx-group-hint--warn {
  color: var(--danger);
}

.rx-field textarea {
  width: 100%;
  background-color: var(--bg-main);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 7px;
  padding: 9px 8px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  line-height: 1.4;
  resize: vertical;
  min-height: 42px;
}

.rx-field textarea:focus {
  outline: none;
  border-color: var(--primary-accent);
}

@media (prefers-reduced-motion: reduce) {
  .rx-collapse {
    transition: none;
  }
}
</style>
