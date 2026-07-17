<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useProgressStore } from '../stores/progress'
import { useWorkoutStore } from '../stores/workout'
import PrimaryButton from '../components/PrimaryButton.vue'
import BackButton from '../components/BackButton.vue'
import { formatWeight } from '../utils/units'
import TrendChart from '../components/TrendChart.vue'
import VolumeChart from '../components/VolumeChart.vue'
import { dateFmt } from '../utils/chart'

const progressStore = useProgressStore()
const workoutStore = useWorkoutStore()

const pageLoading = ref(true)
const unit = computed(() => workoutStore.weightUnit)

onMounted(async () => {
  // All trends/volume/PRs come from one server-side aggregate call now. Force a
  // fresh fetch each visit so the page reflects the latest session immediately
  // (a workout finished/edited/deleted just before opening Progress).
  await progressStore.fetchStats(true)
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

// Any logged exercises means there's data to show.
const hasData = computed(() => progressStore.exercises.length > 0)

// Exercises present in history, most-logged first (from the endpoint).
const exerciseOptions = computed(() => progressStore.exercises)

const selectedExerciseId = ref(null)

// True while the selected exercise's series is being lazy-fetched.
const seriesLoading = computed(() => progressStore.seriesLoading)

// The page ships only the first exercise's series; fetch the rest on demand when
// the dropdown changes (cached after the first load, so no repeat call).
watch(selectedExerciseId, (id) => {
  if (id != null) progressStore.fetchExerciseSeries(id)
})

// ---- Stat tiles (server-computed)
const weekStats = computed(() => progressStore.week)

// ---- PR feed: server-computed; parse dates for formatting.
const recentPRs = computed(() =>
  progressStore.recentPrs.map(pr => ({ ...pr, date: new Date(pr.date) }))
)

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

const trendPoints = computed(() => {
  const series = progressStore.e1rmByExercise[selectedExerciseId.value] || []
  return series.map(p => ({ ...p, date: new Date(p.date) }))
})

const volumeWeeks = computed(() =>
  progressStore.weeklyVolume.map(w => ({ weekStart: new Date(w.week_start), volume: w.volume }))
)

// ---- Recent PRs smooth scroll (from the PRs stat tile)
const recentPRsSection = ref(null)
function scrollToPRs() {
  recentPRsSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}


// Best working set from the 5 most recent sessions of the selected exercise,
// newest first (trendPoints is oldest-first).
const recentTopSets = computed(() => [...trendPoints.value].reverse().slice(0, 5))
</script>

<template>
  <div class="progress-page">
    <div class="flex-row mb-24 gap-12" style="align-items: center;">
      <BackButton />
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
    <div v-else-if="!hasData" class="empty-state card py-40 text-center">
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

        <!-- Skeleton while the selected exercise's series lazy-loads -->
        <div v-if="seriesLoading" class="skel-chart" style="height: 188px;" aria-hidden="true">
          <div class="skel-chart-grid"><span v-for="g in 4" :key="g"></span></div>
          <div class="skel-chart-bars">
            <span v-for="(b, i) in 7" :key="i" class="sk sk-shimmer" :style="{ height: [45, 62, 38, 70, 55, 80, 60][i] + '%' }"></span>
          </div>
        </div>
        <TrendChart v-else :points="trendPoints" :unit="unit" :view-width="viewWidth" />
      </div>

      <!-- Recent top sets: best working set from the last 5 sessions of the
           selected exercise (always visible, newest first) -->
      <div class="card chart-card mb-24" v-if="seriesLoading || recentTopSets.length > 0">
        <h2 class="chart-title">Recent Top Sets</h2>
        <p class="chart-sub">Best working set from your last 5 sessions</p>
        <!-- Skeleton rows while the selected exercise's series lazy-loads -->
        <div v-if="seriesLoading" class="topsets-skeleton" aria-hidden="true">
          <div v-for="n in 5" :key="n" class="sk sk-shimmer topsets-skel-row"></div>
        </div>
        <table v-else class="data-table">
          <caption class="visually-hidden">Best set per session for the selected exercise, most recent first</caption>
          <thead>
            <tr><th>Date</th><th>Best set</th><th>Est. 1RM ({{ unit }})</th></tr>
          </thead>
          <tbody>
            <tr v-for="p in recentTopSets" :key="p.date.getTime()">
              <td>{{ p.date.toLocaleDateString() }}</td>
              <td>{{ formatWeight(p.weight, unit) }}{{ unit }} × {{ p.reps }}</td>
              <td>{{ formatWeight(p.e1rm, unit) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Weekly volume -->
      <div class="card chart-card mb-24">
        <h2 class="chart-title">Weekly volume ({{ unit }})</h2>
        <p class="chart-sub">Working sets only, weight × reps</p>

        <VolumeChart :weeks="volumeWeeks" :unit="unit" :view-width="viewWidth" />
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
  /* Drop the native dropdown arrow (which the browser insets with a large gap,
     making it look shifted left) for a custom chevron pinned a controlled 12px
     from the right edge — symmetric with the text's 12px on the left. */
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-color: var(--bg-surface);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23AAAAAA' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 16px;
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  /* Extra right padding reserves room for the chevron so long names don't run under it. */
  padding: 10px 36px 10px 12px;
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

/* Recent Top Sets loading placeholder (5 rows) */
.topsets-skeleton {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.topsets-skel-row {
  height: 22px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
