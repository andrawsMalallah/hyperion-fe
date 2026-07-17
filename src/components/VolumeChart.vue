<script setup>
import { computed, ref } from 'vue'
import { formatWeight } from '../utils/units'
import { DATA_COLOR, PAD } from '../utils/chart'

// Weekly training-volume bars (working sets only, weight × reps). Renders its
// own empty state, like TrendChart.
const props = defineProps({
  // [{ weekStart: Date, volume }]
  weeks: {
    type: Array,
    default: () => []
  },
  unit: {
    type: String,
    required: true
  },
  // Visible plotting width; the SVG scrolls horizontally past it.
  viewWidth: {
    type: Number,
    required: true
  }
})

const BAR_H = 180
const BAR_SLOT = 56 // min horizontal px per weekly bar

const scrollLeft = ref(0)
const hover = ref(null)

const geo = computed(() => {
  const weeks = props.weeks
  if (weeks.length === 0) return null
  const contentW = Math.max(props.viewWidth, PAD.left + PAD.right + weeks.length * BAR_SLOT)
  const w = contentW - PAD.left - PAD.right
  const h = BAR_H - PAD.top - PAD.bottom
  const max = Math.max(...weeks.map(x => x.volume)) || 1
  const slot = w / weeks.length
  const barW = Math.min(40, Math.max(10, slot - 8))
  const bars = weeks.map((entry, i) => {
    const bh = Math.max(2, (entry.volume / max) * h)
    return {
      ...entry,
      x: PAD.left + slot * i + (slot - barW) / 2,
      y: PAD.top + h - bh,
      w: barW,
      h: bh,
      label: entry.weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    }
  })
  return { bars, baseline: PAD.top + h, width: contentW }
})
</script>

<template>
  <div v-if="!geo" class="chart-empty">No volume yet.</div>
  <div v-else class="chart-holder">
    <div class="chart-scroll" @scroll="scrollLeft = $event.target.scrollLeft">
      <svg :width="geo.width" :height="BAR_H" role="img" aria-label="Weekly training volume">
        <line :x1="PAD.left" :x2="geo.width - PAD.right" :y1="geo.baseline" :y2="geo.baseline" stroke="rgba(255,255,255,0.14)" stroke-width="1" />
        <g v-for="(b, i) in geo.bars" :key="i" @mouseenter="hover = b" @mouseleave="hover = null" @touchstart="hover = b">
          <!-- oversized hit target -->
          <rect :x="b.x - 4" :y="PAD.top" :width="b.w + 8" :height="geo.baseline - PAD.top" fill="transparent" />
          <!-- rounded top, flat baseline: rounded rect clipped at the bottom -->
          <path
            :d="`M${b.x},${geo.baseline} V${b.y + 4} Q${b.x},${b.y} ${b.x + 4},${b.y} H${b.x + b.w - 4} Q${b.x + b.w},${b.y} ${b.x + b.w},${b.y + 4} V${geo.baseline} Z`"
            :fill="DATA_COLOR"
            :opacity="hover && hover.x === b.x ? 1 : 0.85"
          />
          <text :x="b.x + b.w / 2" :y="BAR_H - 10" text-anchor="middle" class="axis-text">{{ b.label }}</text>
        </g>
      </svg>
    </div>
    <div
      v-if="hover"
      class="chart-tooltip"
      :style="{ left: Math.max(8, Math.min(hover.x - scrollLeft, viewWidth - 150)) + 'px', top: (hover.y - 14) + 'px' }"
    >
      <strong>Wk of {{ hover.label }}</strong>
      {{ formatWeight(hover.volume, unit) }}{{ unit }}
    </div>
  </div>
</template>
