<script setup>
import { useRouter } from 'vue-router'

const props = defineProps({
  to: {
    type: [String, Object],
    default: '/'
  },
  label: {
    type: String,
    default: 'Back to Home'
  }
})

const router = useRouter()
</script>

<template>
  <button
    type="button"
    class="btn-secondary back-btn"
    :title="label"
    :aria-label="label"
    @click="router.push(to)"
  >
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6"></polyline>
    </svg>
  </button>
</template>

<style scoped>
.back-btn {
  width: 32px;
  height: 32px;
  min-width: 32px;
  min-height: 32px;
  padding: 0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.back-btn:hover {
  background-color: var(--bg-surface-hover);
  color: var(--primary-accent);
  border-color: var(--primary-accent);
  transform: translateX(-1px);
}

.back-btn:active {
  transform: translateX(0);
}
</style>
