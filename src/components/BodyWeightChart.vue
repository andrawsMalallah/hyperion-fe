<script setup>
import { computed, ref } from 'vue'
import { formatWeight } from '../utils/units'
import { DATA_COLOR, PAD, dateFmt } from '../utils/chart'

// Body-weight line chart: one point per logged day. Mirrors TrendChart's
// geometry/interaction (shared chart primitives in global style.css) but plots a
// single `weight` series instead of estimated 1RM. Renders its own empty state.
const props = defineProps({
  // Oldest-first: [{ date: Date, weight }] (weight in kg)
  points: {
    type: Array,
    default: () => []
  },
  unit: {
    type: String,
    required: true
  },
  // Visible plotting width; the SVG grows past it and scrolls when there are
  // many days, keeping every x label legible.
  viewWidth: {
    type: Number,
    required: true
  }
})

const LINE_H = 200
const LINE_GAP = 56 // min horizontal px between points

const scrollLeft = ref(0)
const hover = ref(null)

const geo = computed(() => {
  const pts = props.points
  if (pts.length < 2) return null
  const contentW = Math.max(props.viewWidth, PAD.left + PAD.right + (pts.length - 1) * LINE_GAP)
  const w = contentW - PAD.left - PAD.right
  const h = LINE_H - PAD.top - PAD.bottom
  const ys = pts.map(p => p.weight)
  // Pad the band a touch so the line isn't pinned to the top/bottom edges; a
  // flat series (all equal) still needs a non-zero range to divide by.
  const rawMax = Math.max(...ys)
  const rawMin = Math.min(...ys)
  const span = rawMax - rawMin || Math.max(rawMax * 0.02, 1)
  const yMax = rawMax + span * 0.15
  const yMin = rawMin - span * 0.15
  const sx = i => PAD.left + (i / (pts.length - 1)) * w
  const sy = v => PAD.top + h - ((v - yMin) / (yMax - yMin)) * h
  const mapped = pts.map((p, i) => ({ ...p, x: sx(i), y: sy(p.weight) }))
  const path = mapped.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const ticks = []
  for (let i = 0; i <= 3; i++) {
    const v = yMin + ((yMax - yMin) * i) / 3
    ticks.push({ v, y: sy(v) })
  }
  return { points: mapped, path, ticks, width: contentW }
})

// Map a client X (mouse or touch) to the nearest point.
function nearestPoint(clientX, target) {
  if (!geo.value) return null
  const rect = target.getBoundingClientRect()
  const x = clientX - rect.left
  let nearest = null
  for (const p of geo.value.points) {
    if (!nearest || Math.abs(p.x - x) < Math.abs(nearest.x - x)) nearest = p
  }
  return nearest
}

function onMove(e) {
  hover.value = nearestPoint(e.clientX, e.currentTarget)
}

function onTouch(e) {
  if (!e.touches[0]) return
  hover.value = nearestPoint(e.touches[0].clientX, e.currentTarget)
}
</script>

<template>
  <div v-if="!geo" class="chart-empty">Log at least two days to see your weight trend.</div>
  <div v-else class="chart-holder">
    <div class="chart-scroll" @scroll="scrollLeft = $event.target.scrollLeft">
      <svg :width="geo.width" :height="LINE_H" @mousemove="onMove" @mouseleave="hover = null" @touchstart="onTouch" role="img" :aria-label="`Body weight trend, ${points.length} entries`">
        <!-- recessive grid -->
        <g v-for="t in geo.ticks" :key="t.y">
          <line :x1="PAD.left" :x2="geo.width - PAD.right" :y1="t.y" :y2="t.y" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
          <text :x="PAD.left - 8" :y="t.y + 4" text-anchor="end" class="axis-text">{{ formatWeight(t.v, unit) }}</text>
        </g>
        <!-- series -->
        <path :d="geo.path" fill="none" :stroke="DATA_COLOR" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        <!-- points -->
        <circle
          v-for="p in geo.points"
          :key="p.x"
          :cx="p.x" :cy="p.y"
          :r="hover && hover.x === p.x ? 5 : 3"
          :fill="DATA_COLOR"
          stroke="#1E1E1E"
          stroke-width="2"
        />
        <!-- crosshair -->
        <line v-if="hover" :x1="hover.x" :x2="hover.x" :y1="PAD.top" :y2="LINE_H - PAD.bottom" stroke="rgba(255,255,255,0.18)" stroke-width="1" />
        <!-- direct label on the last point -->
        <text
          v-if="geo.points.length"
          :x="geo.points[geo.points.length - 1].x"
          :y="geo.points[geo.points.length - 1].y - 10"
          text-anchor="end"
          class="direct-label"
        >{{ formatWeight(geo.points[geo.points.length - 1].weight, unit) }}{{ unit }}</text>
        <!-- x labels -->
        <text v-for="(p, i) in geo.points" :key="'xl' + i" :x="p.x" :y="LINE_H - 10" text-anchor="middle" class="axis-text">{{ dateFmt(p.date) }}</text>
      </svg>
    </div>
    <div
      v-if="hover"
      class="chart-tooltip"
      :style="{ left: Math.max(8, Math.min(hover.x - scrollLeft + 10, viewWidth - 130)) + 'px', top: (hover.y - 14) + 'px' }"
    >
      <strong>{{ dateFmt(hover.date) }}</strong>
      {{ formatWeight(hover.weight, unit) }}{{ unit }}
    </div>
  </div>
</template>
