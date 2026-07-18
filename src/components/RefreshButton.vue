<script setup>
// Manual refresh affordance (ROADMAP 3.6). In an installed PWA the browser's
// native pull-to-refresh is gone and the read stores cache for 60s, so a user
// who knows data changed elsewhere has no way to force a reload. Icon-only,
// 32px square to match the page-header BackButton / export pill.
defineProps({
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['refresh'])
</script>

<template>
  <button
    type="button"
    class="btn-secondary refresh-btn"
    :disabled="loading"
    title="Refresh"
    aria-label="Refresh"
    @click="emit('refresh')"
  >
    <svg
      class="refresh-icon"
      :class="{ 'refresh-icon--spinning': loading }"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <polyline points="23 4 23 10 17 10"></polyline>
      <polyline points="1 20 1 14 7 14"></polyline>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
    </svg>
  </button>
</template>

<style scoped>
.refresh-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: color 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
}

.refresh-icon {
  flex-shrink: 0;
}

/* Spin while a refetch is in flight so the tap has immediate feedback even when
   the data comes back unchanged. */
.refresh-icon--spinning {
  animation: refresh-spin 0.8s linear infinite;
  transform-origin: center;
}

@keyframes refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

@media (hover: hover) {
  .refresh-btn:not(:disabled):hover {
    color: var(--primary-accent);
    border-color: var(--primary-accent);
    background-color: var(--bg-surface-hover);
  }
}

@media (prefers-reduced-motion: reduce) {
  .refresh-icon--spinning {
    animation: none;
  }
}
</style>
