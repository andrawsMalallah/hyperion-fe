<script setup>
import { ref, watch } from 'vue'
import AppModal from './AppModal.vue'
import { useWorkoutStore } from '../stores/workout'
import { formatWeight } from '../utils/units'
import api from '../api'

// One exercise's past sessions, loaded 5 at a time and paginated on scroll
// rather than reading the whole workout history. Opened from the clock icon on
// an exercise card mid-workout.
const props = defineProps({
  show: Boolean,
  // A session row: { id (exercise id), exercise: { name }, ... }.
  exercise: {
    type: Object,
    default: null
  }
})

defineEmits(['update:show'])

const workoutStore = useWorkoutStore()

const logs = ref([])
const page = ref(0)
const lastPage = ref(1)
const loading = ref(false)      // first page
const loadingMore = ref(false)  // subsequent pages

async function loadHistory() {
  if (loading.value || loadingMore.value) return
  const nextPage = page.value + 1
  if (nextPage > lastPage.value && page.value !== 0) return

  const firstLoad = nextPage === 1
  if (firstLoad) loading.value = true
  else loadingMore.value = true

  try {
    const res = await api.get(`/exercises/${props.exercise.id}/logs`, {
      params: { page: nextPage }
    })
    const mapped = res.data.data.map(log => ({
      logId: log.id,
      date: new Date(log.date_timestamp).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }),
      sets: log.sets
    }))
    logs.value = firstLoad ? mapped : [...logs.value, ...mapped]
    page.value = res.data.meta?.current_page || nextPage
    lastPage.value = res.data.meta?.last_page || nextPage
  } catch (e) {
    console.error('Failed to load exercise history:', e)
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function onScroll(e) {
  const el = e.target
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) {
    if (page.value < lastPage.value) loadHistory()
  }
}

// Opening resets and fetches, so reopening on a different exercise never shows
// the previous one's sessions while the first page loads.
watch(() => props.show, (open) => {
  if (!open || !props.exercise) return
  logs.value = []
  page.value = 0
  lastPage.value = 1
  loadHistory()
})
</script>

<template>
  <AppModal
    :show="show"
    :title="(exercise?.exercise?.name || '') + ' History'"
    confirm-text="Close"
    hide-cancel
    max-width="500px"
    @update:show="$emit('update:show', $event)"
  >
    <div class="history-list-container mb-16" @scroll="onScroll">
      <div v-if="loading" class="spinner-container py-24 text-center">
        <div class="spinner spinner-centered"></div>
      </div>
      <div v-else-if="logs.length === 0" class="empty-state py-24 text-center">
        No history yet for this exercise.
      </div>
      <div v-else class="history-grid">
        <div v-for="entry in logs" :key="entry.logId" class="history-log-row">
          <div class="history-log-date">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            {{ entry.date }}
          </div>
          <div class="history-sets-grid">
            <div v-for="(set, sIdx) in entry.sets" :key="set.id" class="history-set-badge">
              <span class="history-set-badge-title">Set {{ sIdx + 1 }}:</span> {{ formatWeight(set.weight, workoutStore.weightUnit) }}{{ workoutStore.weightUnit }} x {{ set.reps }}<template v-if="set.rpe"> @{{ set.rpe }}</template>
            </div>
          </div>
        </div>
        <div v-if="loadingMore" class="spinner-container py-12 text-center">
          <div class="spinner spinner-centered"></div>
        </div>
      </div>
    </div>
  </AppModal>
</template>

<style scoped>
.spinner-centered {
  margin: 0 auto;
}
</style>
