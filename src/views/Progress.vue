<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useHistoryStore } from '../stores/history'
import { useWorkoutStore } from '../stores/workout'
import PrimaryButton from '../components/PrimaryButton.vue'
import { e1rmHistory, weeklyVolume, epley1RM } from '../utils/stats'
import { formatWeight } from '../utils/units'

const router = useRouter()
const historyStore = useHistoryStore()
const workoutStore = useWorkoutStore()

const pageLoading = ref(true)
const unit = computed(() => workoutStore.weightUnit)

// Chart data color — validated against the dark surface (#1E1E1E) with the
// dataviz palette validator; the brand accent #CCFF00 is out of the dark
// lightness band, #7A9900 is the nearest passing step of the same hue.
const DATA_COLOR = '#7A9900'

onMounted(async () => {
  // Pull up to 5 pages so trends cover more than the last 30 sessions.
  await historyStore.fetchHistory(false, false)
  let guard = 0
  while (historyStore.historyHasMore && !historyStore.loadFailed && guard < 4) {
    await historyStore.fetchHistory(false, true)
    guard++
  }
  if (!selectedExerciseId.value && exerciseOptions.value.length > 0) {
    selectedExerciseId.value = exerciseOptions.value[0].id
  }
  pageLoading.value = false
  // Wait for the charts to actually mount before measuring their container.
  await nextTick()
  measure()
  window.addEventListener('resize', measure)
})

onUnmounted(() => window.removeEventListener('resize', measure))

const logs = computed(() => historyStore.workout_logs)

// Exercises present in history, most-logged first.
const exerciseOptions = computed(() => {
  const counts = new Map()
  for (const log of logs.value) {
    for (const s of log.sets || []) {
      if (!s.exercise) continue
      const entry = counts.get(s.exercise_id) || { id: s.exercise_id, name: s.exercise.name, n: 0 }
      entry.n++
      counts.set(s.exercise_id, entry)
    }
  }
  return [...counts.values()].sort((a, b) => b.n - a.n)
})

const selectedExerciseId = ref(null)

// ---- Stat tiles
const weekStats = computed(() => {
  const monday = new Date()
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  let sessions = 0
  let volume = 0
  for (const log of logs.value) {
    if (new Date(log.date_timestamp) < monday) continue
    sessions++
    for (const s of log.sets || []) {
      if ((s.set_type || 'working') !== 'warmup') volume += Number(s.weight) * Number(s.reps)
    }
  }
  return { sessions, volume }
})

// ---- PR feed: sessions where an exercise's est. 1RM beat every prior session
const recentPRs = computed(() => {
  const prs = []
  for (const opt of exerciseOptions.value) {
    const points = e1rmHistory(logs.value, opt.id)
    let best = 0
    for (const p of points) {
      if (best > 0 && p.e1rm > best) {
        prs.push({ exercise: opt.name, date: p.date, weight: p.weight, reps: p.reps, e1rm: p.e1rm })
      }
      if (p.e1rm > best) best = p.e1rm
    }
  }
  return prs.sort((a, b) => b.date - a.date).slice(0, 5)
})

// ---- Chart geometry
// viewWidth is the visible plotting area (the card's inner width). Each chart
// computes its own content width from the number of data points, so when there
// are many sessions the SVG grows past the viewport and scrolls horizontally —
// keeping every label legible instead of cramming them together.
const chartWrap = ref(null)
const viewWidth = ref(560)
function measure() {
  if (chartWrap.value) viewWidth.value = Math.max(240, chartWrap.value.clientWidth - 40)
}

// Horizontal scroll offsets, so the (non-scrolling) tooltips can track the
// point/bar as the chart is scrolled.
const lineScrollLeft = ref(0)
const barScrollLeft = ref(0)

const PAD = { top: 16, right: 16, bottom: 30, left: 44 }
const LINE_H = 220
const BAR_H = 180
const LINE_GAP = 64 // min horizontal px between trend points
const BAR_SLOT = 56 // min horizontal px per weekly bar

const trendPoints = computed(() => {
  if (!selectedExerciseId.value) return []
  return e1rmHistory(logs.value, selectedExerciseId.value)
})

const trendGeo = computed(() => {
  const pts = trendPoints.value
  if (pts.length < 2) return null
  const contentW = Math.max(viewWidth.value, PAD.left + PAD.right + (pts.length - 1) * LINE_GAP)
  const w = contentW - PAD.left - PAD.right
  const h = LINE_H - PAD.top - PAD.bottom
  const ys = pts.map(p => p.e1rm)
  const yMax = Math.max(...ys) * 1.08
  const yMin = Math.min(...ys) * 0.92
  // Space points evenly by session index (not by calendar gap) so labels never
  // collide when several sessions fall on nearby dates.
  const sx = i => PAD.left + (pts.length === 1 ? w / 2 : (i / (pts.length - 1)) * w)
  const sy = v => PAD.top + h - ((v - yMin) / (yMax - yMin)) * h
  const mapped = pts.map((p, i) => ({ ...p, x: sx(i), y: sy(p.e1rm) }))
  const path = mapped.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  // ~4 recessive horizontal gridlines with round-ish values
  const ticks = []
  for (let i = 0; i <= 3; i++) {
    const v = yMin + ((yMax - yMin) * i) / 3
    ticks.push({ v, y: sy(v) })
  }
  return { points: mapped, path, ticks, width: contentW }
})

const volumeWeeks = computed(() => weeklyVolume(logs.value, 8))

const barGeo = computed(() => {
  const weeks = volumeWeeks.value
  if (weeks.length === 0) return null
  const contentW = Math.max(viewWidth.value, PAD.left + PAD.right + weeks.length * BAR_SLOT)
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

// ---- Hover / tap state
const lineHover = ref(null)
const barHover = ref(null)

// Map a client X (mouse or touch) to the nearest trend point.
function nearestPoint(clientX, target) {
  if (!trendGeo.value) return null
  const rect = target.getBoundingClientRect()
  const x = clientX - rect.left
  let nearest = null
  for (const p of trendGeo.value.points) {
    if (!nearest || Math.abs(p.x - x) < Math.abs(nearest.x - x)) nearest = p
  }
  return nearest
}

function onLineMove(e) {
  lineHover.value = nearestPoint(e.clientX, e.currentTarget)
}

// Tap-to-inspect on touch devices, where hover doesn't exist.
function onLineTouch(e) {
  if (!e.touches[0]) return
  lineHover.value = nearestPoint(e.touches[0].clientX, e.currentTarget)
}

// ---- Recent PRs smooth scroll (from the PRs stat tile)
const recentPRsSection = ref(null)
function scrollToPRs() {
  recentPRsSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const dateFmt = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

const showTable = ref(false)
</script>

<template>
  <div class="progress-page">
    <div class="flex-row mb-24 gap-12" style="align-items: center;">
      <button class="btn-secondary back-btn tap-target" @click="router.push('/')" title="Back to Home" aria-label="Back to Home" style="width: 32px; height: 32px; min-width: 32px; min-height: 32px; padding: 0; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <h1 class="title m-0">Progress</h1>
    </div>

    <!-- Loading — mirrors the tiles, filter and chart cards below -->
    <div v-if="pageLoading" class="progress-skeleton" aria-hidden="true">
      <!-- Stat tiles: label bar over value bar, in real tile chrome -->
      <div class="stat-tiles mb-24">
        <div v-for="n in 3" :key="n" class="card stat-tile">
          <div class="sk sk-shimmer" style="width: 70%; height: 9px;"></div>
          <div class="sk sk-shimmer" style="width: 48px; height: 24px;"></div>
        </div>
      </div>

      <!-- Filter row: label + select -->
      <div class="filter-row mb-16">
        <div class="sk sk-shimmer" style="width: 60px; height: 11px;"></div>
        <div class="sk sk-shimmer" style="width: 100%; max-width: 400px; height: 40px; border-radius: 8px;"></div>
      </div>

      <!-- Chart cards: title/subtitle + a chart-shaped placeholder -->
      <div v-for="n in 2" :key="'c' + n" class="card chart-card mb-24">
        <div class="sk sk-shimmer" style="width: 45%; height: 15px; margin-bottom: 8px;"></div>
        <div class="sk sk-shimmer" style="width: 65%; height: 12px; margin-bottom: 16px;"></div>
        <div class="skel-chart" :style="{ height: n === 1 ? '188px' : '148px' }">
          <!-- faint y-axis ticks + a run of bars, hinting at the real chart -->
          <div class="skel-chart-grid">
            <span v-for="g in 4" :key="g"></span>
          </div>
          <div class="skel-chart-bars">
            <span
              v-for="(b, i) in (n === 1 ? 7 : 8)"
              :key="i"
              class="sk sk-shimmer"
              :style="{ height: [45, 62, 38, 70, 55, 80, 60, 48][i] + '%' }"
            ></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else-if="logs.length === 0" class="empty-state card py-40 text-center">
      <p style="color: var(--text-secondary); margin: 0 0 16px 0;">Log a few workouts and your progress charts will appear here.</p>
      <PrimaryButton to="/" class="inline-flex no-underline px-24" style="justify-content: center; max-width: max-content; margin: 0 auto;">
        Start Training
      </PrimaryButton>
    </div>

    <template v-else>
      <!-- Stat tiles -->
      <div class="stat-tiles mb-24">
        <div class="card stat-tile">
          <span class="tile-label">Sessions this week</span>
          <span class="tile-value">{{ weekStats.sessions }}</span>
        </div>
        <div class="card stat-tile">
          <span class="tile-label">Volume this week</span>
          <span class="tile-value">{{ formatWeight(weekStats.volume, unit) }}<span class="tile-unit">{{ unit }}</span></span>
        </div>
        <button
          type="button"
          class="card stat-tile stat-tile--action"
          :disabled="recentPRs.length === 0"
          @click="scrollToPRs"
          title="Jump to Recent PRs"
        >
          <span class="tile-label">PRs (recent)</span>
          <span class="tile-value">{{ recentPRs.length }}</span>
        </button>
      </div>

      <!-- Filter row -->
      <div class="filter-row mb-16">
        <label class="filter-label" for="exercise-select">Exercise</label>
        <select id="exercise-select" class="exercise-select" v-model="selectedExerciseId">
          <option v-for="opt in exerciseOptions" :key="opt.id" :value="opt.id">{{ opt.name }}</option>
        </select>
      </div>

      <!-- Est. 1RM trend -->
      <div class="card chart-card mb-24" ref="chartWrap">
        <h2 class="chart-title">Estimated 1RM ({{ unit }})</h2>
        <p class="chart-sub">Best working set per session · Epley: weight × (1 + reps ÷ 30)</p>

        <div v-if="!trendGeo" class="chart-empty">Need at least two sessions of this exercise to draw a trend.</div>
        <div v-else class="chart-holder">
          <div class="chart-scroll" @scroll="lineScrollLeft = $event.target.scrollLeft">
            <svg :width="trendGeo.width" :height="LINE_H" @mousemove="onLineMove" @mouseleave="lineHover = null" @touchstart="onLineTouch" role="img" :aria-label="`Estimated one rep max trend, ${trendPoints.length} sessions`">
              <!-- recessive grid -->
              <g v-for="t in trendGeo.ticks" :key="t.y">
                <line :x1="PAD.left" :x2="trendGeo.width - PAD.right" :y1="t.y" :y2="t.y" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
                <text :x="PAD.left - 8" :y="t.y + 4" text-anchor="end" class="axis-text">{{ formatWeight(t.v, unit) }}</text>
              </g>
              <!-- series -->
              <path :d="trendGeo.path" fill="none" :stroke="DATA_COLOR" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
              <!-- points: small always, larger ring on hover/tap -->
              <circle
                v-for="p in trendGeo.points"
                :key="p.x"
                :cx="p.x" :cy="p.y"
                :r="lineHover && lineHover.x === p.x ? 5 : 3"
                :fill="DATA_COLOR"
                stroke="#1E1E1E"
                stroke-width="2"
              />
              <!-- crosshair -->
              <line v-if="lineHover" :x1="lineHover.x" :x2="lineHover.x" :y1="PAD.top" :y2="LINE_H - PAD.bottom" stroke="rgba(255,255,255,0.18)" stroke-width="1" />
              <!-- selective direct label: last point only -->
              <text
                v-if="trendGeo.points.length"
                :x="trendGeo.points[trendGeo.points.length - 1].x"
                :y="trendGeo.points[trendGeo.points.length - 1].y - 10"
                text-anchor="end"
                class="direct-label"
              >{{ formatWeight(trendGeo.points[trendGeo.points.length - 1].e1rm, unit) }}{{ unit }}</text>
              <!-- x labels: every session date (chart scrolls to keep them legible) -->
              <text v-for="(p, i) in trendGeo.points" :key="'xl' + i" :x="p.x" :y="LINE_H - 10" text-anchor="middle" class="axis-text">{{ dateFmt(p.date) }}</text>
            </svg>
          </div>
          <div
            v-if="lineHover"
            class="chart-tooltip"
            :style="{ left: Math.max(8, Math.min(lineHover.x - lineScrollLeft + 10, viewWidth - 150)) + 'px', top: (lineHover.y - 14) + 'px' }"
          >
            <strong>{{ dateFmt(lineHover.date) }}</strong>
            {{ formatWeight(lineHover.weight, unit) }}{{ unit }} × {{ lineHover.reps }}
            <span class="tt-muted">est. {{ formatWeight(lineHover.e1rm, unit) }}{{ unit }}</span>
          </div>
        </div>
      </div>

      <!-- Weekly volume -->
      <div class="card chart-card mb-24">
        <h2 class="chart-title">Weekly volume ({{ unit }})</h2>
        <p class="chart-sub">Working sets only, weight × reps</p>

        <div v-if="!barGeo" class="chart-empty">No volume yet.</div>
        <div v-else class="chart-holder">
          <div class="chart-scroll" @scroll="barScrollLeft = $event.target.scrollLeft">
            <svg :width="barGeo.width" :height="BAR_H" role="img" aria-label="Weekly training volume">
              <line :x1="PAD.left" :x2="barGeo.width - PAD.right" :y1="barGeo.baseline" :y2="barGeo.baseline" stroke="rgba(255,255,255,0.14)" stroke-width="1" />
              <g v-for="(b, i) in barGeo.bars" :key="i" @mouseenter="barHover = b" @mouseleave="barHover = null" @touchstart="barHover = b">
                <!-- oversized hit target -->
                <rect :x="b.x - 4" :y="PAD.top" :width="b.w + 8" :height="barGeo.baseline - PAD.top" fill="transparent" />
                <!-- rounded top, flat baseline: rounded rect clipped at the bottom -->
                <path
                  :d="`M${b.x},${barGeo.baseline} V${b.y + 4} Q${b.x},${b.y} ${b.x + 4},${b.y} H${b.x + b.w - 4} Q${b.x + b.w},${b.y} ${b.x + b.w},${b.y + 4} V${barGeo.baseline} Z`"
                  :fill="DATA_COLOR"
                  :opacity="barHover && barHover.x === b.x ? 1 : 0.85"
                />
                <text :x="b.x + b.w / 2" :y="BAR_H - 10" text-anchor="middle" class="axis-text">{{ b.label }}</text>
              </g>
            </svg>
          </div>
          <div
            v-if="barHover"
            class="chart-tooltip"
            :style="{ left: Math.max(8, Math.min(barHover.x - barScrollLeft, viewWidth - 150)) + 'px', top: (barHover.y - 14) + 'px' }"
          >
            <strong>Wk of {{ barHover.label }}</strong>
            {{ formatWeight(barHover.volume, unit) }}{{ unit }}
          </div>
        </div>
      </div>

      <!-- Recent PRs -->
      <div class="card chart-card mb-24" v-if="recentPRs.length > 0" ref="recentPRsSection">
        <h2 class="chart-title">Recent PRs</h2>
        <div class="pr-list">
          <div v-for="(pr, i) in recentPRs" :key="i" class="pr-row">
            <span class="pr-badge" aria-hidden="true">PR</span>
            <div class="pr-info">
              <span class="pr-exercise">{{ pr.exercise }}</span>
              <span class="pr-detail">{{ formatWeight(pr.weight, unit) }}{{ unit }} × {{ pr.reps }} · est. {{ formatWeight(pr.e1rm, unit) }}{{ unit }}</span>
            </div>
            <span class="pr-date">{{ dateFmt(pr.date) }}</span>
          </div>
        </div>
      </div>

      <!-- Table fallback -->
      <div class="card chart-card mb-24" v-if="trendPoints.length > 0">
        <button class="table-toggle" @click="showTable = !showTable" :aria-expanded="showTable">
          {{ showTable ? 'Hide' : 'Show' }} data table
        </button>
        <div class="table-collapse" :class="{ 'table-collapse--open': showTable }">
          <div class="table-collapse-inner">
            <table class="data-table">
              <caption class="visually-hidden">Best set per session for the selected exercise</caption>
              <thead>
                <tr><th>Date</th><th>Best set</th><th>Est. 1RM ({{ unit }})</th></tr>
              </thead>
              <tbody>
                <tr v-for="p in [...trendPoints].reverse()" :key="p.date.getTime()">
                  <td>{{ p.date.toLocaleDateString() }}</td>
                  <td>{{ formatWeight(p.weight, unit) }}{{ unit }} × {{ p.reps }}</td>
                  <td>{{ formatWeight(p.e1rm, unit) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.stat-tiles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

/* --- Loading skeleton --- */
/* Skeleton primitives with a moving sheen (matches Home/History), shaped like
   the real content below so the transition into loaded state doesn't jump. */
.sk {
  background: var(--bg-surface-hover);
  border-radius: 6px;
  flex-shrink: 0;
}

.sk-shimmer {
  position: relative;
  overflow: hidden;
}

.sk-shimmer::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.06) 50%,
    transparent 100%
  );
  animation: sk-sheen 1.4s infinite;
}

@keyframes sk-sheen {
  100% { transform: translateX(100%); }
}

/* Chart placeholder: a bordered plot area with faint gridlines and a row of
   varied-height bars, so it reads as a chart rather than a blank block. */
.skel-chart {
  position: relative;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: rgba(0, 0, 0, 0.12);
  padding: 12px 12px 12px 40px;
}

.skel-chart-grid {
  position: absolute;
  inset: 12px 12px 12px 40px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.skel-chart-grid span {
  height: 1px;
  background: rgba(255, 255, 255, 0.05);
}

.skel-chart-bars {
  position: relative;
  height: 100%;
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.skel-chart-bars .sk {
  flex: 1;
  border-radius: 4px 4px 0 0;
  min-width: 0;
}

@media (prefers-reduced-motion: reduce) {
  .sk-shimmer::after {
    animation: none;
  }
}

@media (max-width: 480px) {
  .stat-tiles {
    grid-template-columns: 1fr 1fr;
    /* Equal horizontal and vertical spacing between the 2-then-1 tiles. */
    column-gap: 8px;
    row-gap: 8px;
  }
}

.stat-tile {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border: 1px solid var(--border-color);
  /* Base .card adds margin-bottom:16px; inside the grid that stacks onto the
     row-gap and makes the vertical gap larger than the horizontal one. */
  margin-bottom: 0;
}

/* PRs tile doubles as a jump-to-Recent-PRs button */
.stat-tile--action {
  cursor: pointer;
  text-align: left;
  font: inherit;
  transition: border-color 0.18s ease, transform 0.18s ease;
}

.stat-tile--action:not(:disabled):hover {
  border-color: var(--primary-accent);
  transform: translateY(-1px);
}

.stat-tile--action:disabled {
  cursor: default;
}

.tile-label {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

.tile-value {
  font-size: 26px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
}

.tile-unit {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-left: 4px;
}

.filter-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.filter-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.exercise-select {
  width: 100%;
  max-width: 400px;
  background-color: var(--bg-surface);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  font-weight: 600;
}

.exercise-select:focus {
  outline: none;
  border-color: var(--primary-accent);
}

.chart-card {
  padding: 20px;
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.chart-title {
  font-size: 15px;
  font-weight: 800;
  margin: 0;
  color: var(--text-primary);
}

.chart-sub {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 4px 0 12px 0;
}

.chart-holder {
  position: relative;
}

/* Horizontally scrollable chart area with the scrollbar hidden — many
   sessions grow the SVG past the viewport, keeping every label legible. */
.chart-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  -webkit-overflow-scrolling: touch;
}

.chart-scroll::-webkit-scrollbar {
  display: none;
}

.chart-empty {
  color: var(--text-secondary);
  font-size: 13px;
  padding: 24px 0;
}

.axis-text {
  font-size: 10px;
  fill: var(--text-secondary);
  font-weight: 600;
}

.direct-label {
  font-size: 11px;
  fill: var(--text-primary);
  font-weight: 700;
}

.chart-tooltip {
  position: absolute;
  transform: translateY(-100%);
  background: rgba(18, 18, 18, 0.95);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text-primary);
  pointer-events: none;
  white-space: nowrap;
  display: flex;
  gap: 8px;
  align-items: baseline;
  z-index: 10;
}

.tt-muted {
  color: var(--text-secondary);
}

.pr-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.pr-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background-color: rgba(0, 0, 0, 0.18);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.pr-badge {
  background-color: rgba(204, 255, 0, 0.12);
  color: var(--primary-accent);
  font-size: 11px;
  font-weight: 800;
  padding: 4px 8px;
  border-radius: 6px;
  flex-shrink: 0;
}

.pr-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.pr-exercise {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.pr-detail {
  font-size: 12px;
  color: var(--text-secondary);
}

.pr-date {
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.table-toggle {
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.table-toggle:hover {
  color: var(--text-primary);
  border-color: var(--primary-accent);
}

/* Smooth expand/collapse — the table stays mounted and its height animates
   via the grid-rows 0fr→1fr technique (no JS, reversible both ways). */
.table-collapse {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows 0.28s ease, opacity 0.28s ease;
}

.table-collapse--open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.table-collapse-inner {
  overflow: hidden;
  min-height: 0;
}

@media (prefers-reduced-motion: reduce) {
  .table-collapse {
    transition: none;
  }
}

.data-table {
  width: 100%;
  margin-top: 12px;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table th {
  text-align: left;
  color: var(--text-secondary);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color);
}

.data-table td {
  padding: 6px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
