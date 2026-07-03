<script setup>
import { useToastStore } from '../stores/toast'

const toastStore = useToastStore()
</script>

<template>
  <div class="toast-host" aria-live="polite">
    <TransitionGroup name="toast-slide">
      <div
        v-for="toast in toastStore.toasts"
        :key="toast.id"
        class="toast"
        :class="'toast--' + toast.type"
        role="status"
        @click="toastStore.dismiss(toast.id)"
      >
        <span class="toast-dot"></span>
        <span class="toast-message">{{ toast.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: calc(12px + env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  z-index: 3000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: min(92vw, 420px);
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 16px;
  border-radius: 12px;
  background: rgba(26, 26, 26, 0.94);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  cursor: pointer;
  pointer-events: auto;
}

.toast-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.toast--success .toast-dot {
  background-color: var(--success);
  box-shadow: 0 0 8px rgba(0, 230, 118, 0.6);
}

.toast--error .toast-dot {
  background-color: var(--danger);
  box-shadow: 0 0 8px rgba(255, 77, 77, 0.6);
}

.toast-message {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
}

.toast-slide-enter-active {
  transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.toast-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-slide-enter-from {
  opacity: 0;
  transform: translateY(-10px) scale(0.97);
}

.toast-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}
</style>
