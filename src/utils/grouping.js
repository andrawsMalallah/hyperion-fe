// The exercise "type" carried on a day's prescription. Mirrors the backend
// App\Services\ExerciseGrouping — the values and the group-size rules must match
// or the server will 422 on save.
//
// A type is exclusive: an exercise is at most one of these. Drop set and pyramid
// set are tags describing a single exercise; superset and giant set join several
// exercises of a day into one group via a shared group_key.

export const DROP_SET = 'drop_set'
export const PYRAMID_SET = 'pyramid_set'
export const SUPERSET = 'superset'
export const GIANT_SET = 'giant_set'

/** Types describing one exercise on its own — these never carry a group_key. */
export const TAG_TYPES = [DROP_SET, PYRAMID_SET]

/** Types joining several exercises — these always carry a group_key. */
export const GROUP_TYPES = [SUPERSET, GIANT_SET]

/** Member counts each group type requires. A null max means "no upper bound". */
export const GROUP_SIZES = {
  [SUPERSET]: { min: 2, max: 2 },
  [GIANT_SET]: { min: 3, max: null }
}

const LABELS = {
  [DROP_SET]: 'Drop Set',
  [PYRAMID_SET]: 'Pyramid Set',
  [SUPERSET]: 'Superset',
  [GIANT_SET]: 'Giant Set'
}

/** Options for the builder's type picker, in the order they're offered. */
export const TYPE_OPTIONS = [
  { value: DROP_SET, label: LABELS[DROP_SET] },
  { value: PYRAMID_SET, label: LABELS[PYRAMID_SET] },
  { value: SUPERSET, label: LABELS[SUPERSET] },
  { value: GIANT_SET, label: LABELS[GIANT_SET] }
]

export function typeLabel(type) {
  return LABELS[type] || ''
}

export function isGroupType(type) {
  return GROUP_TYPES.includes(type)
}

export function isTagType(type) {
  return TAG_TYPES.includes(type)
}

/** The type set on an exercise in a day, or null. */
export function typeOf(day, exerciseId) {
  return day?.prescriptions?.[exerciseId]?.group_type || null
}

/** The group key set on an exercise in a day, or null. */
export function groupKeyOf(day, exerciseId) {
  const key = day?.prescriptions?.[exerciseId]?.group_key
  return key === undefined || key === '' ? null : key
}

/**
 * Exercise ids sharing `groupKey` in this day, in the day's own exercise order.
 */
export function groupMembers(day, groupKey) {
  if (groupKey === null || groupKey === undefined) return []
  return (day?.exercises || []).filter(id => groupKeyOf(day, id) === groupKey)
}

/**
 * A group key not yet used in this day. Keys only have to be unique within a
 * day, so the smallest free one keeps them stable and readable (group 1, 2, …).
 */
export function nextGroupKey(day) {
  const used = new Set((day?.exercises || []).map(id => groupKeyOf(day, id)).filter(k => k !== null))
  let key = 1
  while (used.has(key)) key += 1
  return key
}

/**
 * The group keys of a day, in the order their first member appears — so a group
 * can be labelled by position ("Superset A", "Superset B").
 */
export function orderedGroupKeys(day) {
  const seen = []
  ;(day?.exercises || []).forEach(id => {
    const key = groupKeyOf(day, id)
    if (key !== null && isGroupType(typeOf(day, id)) && !seen.includes(key)) seen.push(key)
  })
  return seen
}

/** "A", "B", "C" … for the nth group of a day. */
export function groupLetter(day, groupKey) {
  const index = orderedGroupKeys(day).indexOf(groupKey)
  return index === -1 ? '' : String.fromCharCode(65 + index)
}

/**
 * Whether `exerciseId` is the last member of its group in the day's order —
 * the one whose rest fires, since a superset rests only after the whole group.
 */
export function isLastOfGroup(day, exerciseId) {
  const key = groupKeyOf(day, exerciseId)
  if (key === null || !isGroupType(typeOf(day, exerciseId))) return true
  const members = groupMembers(day, key)
  return members[members.length - 1] === exerciseId
}

/**
 * Check a day's groups against the same rules the server enforces, so a broken
 * group is caught before the request rather than coming back as a 422.
 *
 * @returns {string|null} a user-facing message, or null when the day is valid
 */
export function validateDayGroups(day) {
  const groups = new Map()

  for (const exerciseId of day?.exercises || []) {
    const type = typeOf(day, exerciseId)
    const key = groupKeyOf(day, exerciseId)

    if (!type) {
      if (key !== null) return 'An exercise can only belong to a group when it has a superset or giant set type.'
      continue
    }
    if (isTagType(type) && key !== null) {
      return 'A drop set or pyramid set applies to a single exercise and cannot be part of a group.'
    }
    if (isGroupType(type)) {
      if (key === null) return 'A superset or giant set must be joined with the other exercises in its group.'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(type)
    }
  }

  for (const types of groups.values()) {
    const unique = [...new Set(types)]
    if (unique.length > 1) return 'The exercises in one group must all have the same type.'

    const type = unique[0]
    const { min, max } = GROUP_SIZES[type]
    if (types.length < min) {
      return type === SUPERSET
        ? 'A superset must join exactly 2 exercises.'
        : 'A giant set must join at least 3 exercises.'
    }
    if (max !== null && types.length > max) {
      return 'A superset must join exactly 2 exercises. Use a giant set for 3 or more.'
    }
  }

  return null
}
