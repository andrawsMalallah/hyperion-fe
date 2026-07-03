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

// ---- Chart geometry (client-measured width; fixed heights)
const chartWrap = ref(null)
const chartWidth = ref(600)
function measure() {
  if (chartWrap.value) chartWidth.value = Math.max(280, chartWrap.value.clientWidth)
}

const PAD = { top: 16, right: 16, bottom: 26, left: 44 }
const LINE_H = 220
const BAR_H = 180

const trendPoints = computed(() => {
  if (!selectedExerciseId.value) return []
  return e1rmHistory(logs.value, selectedExerciseId.value)
})

const trendGeo = computed(() => {
  const pts = trendPoints.value
  if (pts.length < 2) return null
  const w = chartWidth.value - PAD.left - PAD.right
  const h = LINE_H - PAD.top - PAD.bottom
  const xs = pts.map(p => p.date.getTime())
  const ys = pts.map(p => p.e1rm)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const yMax = Math.max(...ys) * 1.08
  const yMin = Math.min(...ys) * 0.92
  const sx = t => PAD.left + (xMax === xMin ? w / 2 : ((t - xMin) / (xMax - xMin)) * w)
  const sy = v => PAD.top + h - ((v - yMin) / (yMax - yMin)) * h
  const mapped = pts.map(p => ({ ...p, x: sx(p.date.getTime()), y: sy(p.e1rm) }))
  const path = mapped.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  // ~4 recessive horizontal gridlines with round-ish values
  const ticks = []
  for (let i = 0; i <= 3; i++) {
    const v = yMin + ((yMax - yMin) * i) / 3
    ticks.push({ v, y: sy(v) })
  }
  return { points: mapped, path, ticks }
})

const volumeWeeks = computed(() => weeklyVolume(logs.value, 8))

const barGeo = computed(() => {
  const weeks = volumeWeeks.value
  if (weeks.length === 0) return null
  const w = chartWidth.value - PAD.left - PAD.right
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
  return { bars, baseline: PAD.top + h }
})

// ---- Hover state
const lineHover = ref(null)
const barHover = ref(null)

function onLineMove(e) {
  if (!trendGeo.value) return
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left
  let nearest = null
  for (const p of trendGeo.value.points) {
    if (!nearest || Math.abs(p.x - x) < Math.abs(nearest.x - x)) nearest = p
  }
  lineHover.value = nearest
}

const dateFmt = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

const showTable = ref(false)
</script>

<template>
  <div class="progress-page">
    <div class="flex-row mb-24 gap-12" style="align-items: center;">
      <button class="btn-secondary back-btn tap-target" @click="router.push('/')" title="Back to Home" aria-label="Back to Home" style="width: 44px; height: 44px; min-width: 44px; min-height: 44px; padding: 0; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <h1 class="title m-0">Progress</h1>
    </div>

    <!-- Loading -->
    <div v-if="pageLoading" class="card skeleton-pulse" style="height: 220px;"></div>

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
        <div class="card stat-tile">
          <span class="tile-label">PRs (recent)</span>
          <span class="tile-value">{{ recentPRs.length }}</span>
        </div>
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
        <p class="chart-sub">Best working set per session, Epley formula</p>

        <div v-if="!trendGeo" class="chart-empty">Need at least two sessions of this exercise to draw a trend.</div>
        <div v-else class="chart-holder">
          <svg :width="chartWidth" :height="LINE_H" @mousemove="onLineMove" @mouseleave="lineHover = null" role="img" :aria-label="`Estimated one rep max trend, ${trendPoints.length} sessions`">
            <!-- recessive grid -->
            <g v-for="t in trendGeo.ticks" :key="t.y">
              <line :x1="PAD.left" :x2="chartWidth - PAD.right" :y1="t.y" :y2="t.y" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
              <text :x="PAD.left - 8" :y="t.y + 4" text-anchor="end" class="axis-text">{{ formatWeight(t.v, unit) }}</text>
            </g>
            <!-- series -->
            <path :d="trendGeo.path" fill="none" :stroke="DATA_COLOR" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
            <!-- points: small always, 8px ring on hover -->
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
            <!-- x labels: first and last date -->
            <text :x="trendGeo.points[0].x" :y="LINE_H - 8" text-anchor="start" class="axis-text">{{ dateFmt(trendGeo.points[0].date) }}</text>
            <text :x="trendGeo.points[trendGeo.points.length - 1].x" :y="LINE_H - 8" text-anchor="end" class="axis-text">{{ dateFmt(trendGeo.points[trendGeo.points.length - 1].date) }}</text>
          </svg>
          <div
            v-if="lineHover"
            class="chart-tooltip"
            :style="{ left: Math.min(lineHover.x + 10, chartWidth - 150) + 'px', top: (lineHover.y - 14) + 'px' }"
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
          <svg :width="chartWidth" :height="BAR_H" role="img" aria-label="Weekly training volume">
            <line :x1="PAD.left" :x2="chartWidth - PAD.right" :y1="barGeo.baseline" :y2="barGeo.baseline" stroke="rgba(255,255,255,0.14)" stroke-width="1" />
            <g v-for="(b, i) in barGeo.bars" :key="i" @mouseenter="barHover = b" @mouseleave="barHover = null">
              <!-- oversized hit target -->
              <rect :x="b.x - 4" :y="PAD.top" :width="b.w + 8" :height="barGeo.baseline - PAD.top" fill="transparent" />
              <!-- rounded top, flat baseline: rounded rect clipped at the bottom -->
              <path
                :d="`M${b.x},${barGeo.baseline} V${b.y + 4} Q${b.x},${b.y} ${b.x + 4},${b.y} H${b.x + b.w - 4} Q${b.x + b.w},${b.y} ${b.x + b.w},${b.y + 4} V${barGeo.baseline} Z`"
                :fill="DATA_COLOR"
                :opacity="barHover && barHover.x === b.x ? 1 : 0.85"
              />
              <text :x="b.x + b.w / 2" :y="BAR_H - 8" text-anchor="middle" class="axis-text">{{ b.label }}</text>
            </g>
          </svg>
          <div
            v-if="barHover"
            class="chart-tooltip"
            :style="{ left: Math.min(barHover.x, chartWidth - 150) + 'px', top: (barHover.y - 14) + 'px' }"
          >
            <strong>Wk of {{ barHover.label }}</strong>
            {{ formatWeight(barHover.volume, unit) }}{{ unit }}
          </div>
        </div>
      </div>

      <!-- Recent PRs -->
      <div class="card chart-card mb-24" v-if="recentPRs.length > 0">
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
        <table v-if="showTable" class="data-table">
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
    </template>
  </div>
</template>

<style scoped>
.stat-tiles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

@media (max-width: 480px) {
  .stat-tiles {
    grid-template-columns: 1fr 1fr;
  }
}

.stat-tile {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border: 1px solid var(--border-color);
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
  align-items: center;
  gap: 10px;
}

.filter-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.exercise-select {
  flex: 1;
  max-width: 320px;
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
