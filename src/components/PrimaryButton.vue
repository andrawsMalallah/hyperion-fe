<script setup>
import { computed } from 'vue'

const props = defineProps({
  to: {
    type: [String, Object],
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  },
  type: {
    type: String,
    default: 'button'
  }
})

const isRouterLink = computed(() => !!props.to)
</script>

<template>
  <router-link 
    v-if="isRouterLink" 
    :to="to" 
    class="btn-primary tap-target"
    :style="disabled ? { pointerEvents: 'none', opacity: 0.6 } : {}"
  >
    <slot></slot>
  </router-link>
  <button 
    v-else 
    :type="type" 
    :disabled="disabled" 
    class="btn-primary tap-target"
  >
    <slot></slot>
  </button>
</template>
