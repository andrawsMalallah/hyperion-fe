<script setup>
import { ref, watch, nextTick, onUnmounted } from 'vue'
import PrimaryButton from './PrimaryButton.vue'

const props = defineProps({
  show: Boolean,
  title: String,
  message: String,
  type: {
    type: String,
    default: 'confirm' // 'confirm', 'prompt', or 'custom'
  },
  defaultValue: {
    type: String,
    default: ''
  },
  confirmText: {
    type: String,
    default: 'OK'
  },
  cancelText: {
    type: String,
    default: 'Cancel'
  },
  maxWidth: {
    type: String,
    default: '400px'
  },
  hideCancel: {
    type: Boolean,
    default: false
  },
  hideFooter: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:show', 'confirm', 'cancel'])

const inputValue = ref(props.defaultValue)
const inputRef = ref(null)

watch(() => props.show, (newVal) => {
  if (newVal) {
    document.documentElement.classList.add('modal-open')
    document.body.classList.add('modal-open')
    inputValue.value = props.defaultValue
    if (props.type === 'prompt') {
      nextTick(() => {
        if (inputRef.value) inputRef.value.focus()
      })
    }
  } else {
    document.documentElement.classList.remove('modal-open')
    document.body.classList.remove('modal-open')
  }
})

onUnmounted(() => {
  if (props.show) {
    document.documentElement.classList.remove('modal-open')
    document.body.classList.remove('modal-open')
  }
})

const onConfirm = () => {
  emit('confirm', props.type === 'prompt' ? inputValue.value : true)
  emit('update:show', false)
}

const onCancel = () => {
  emit('cancel')
  emit('update:show', false)
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="show" class="modal-overlay" @click.self="onCancel">
      <div class="modal-content card" :style="{ maxWidth: maxWidth, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }">
        
        <!-- Header -->
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
          <slot name="header">
            <div class="modal-title-box">
              <h2 class="subtitle m-0 text-accent" style="font-weight: 800; font-size: 20px; line-height: 1.2;">{{ title }}</h2>
              <p v-if="message" class="section-desc-top" style="margin: 20px 0 0 0; font-size: 13px; color: var(--text-secondary); line-height: 1.4;">{{ message }}</p>
            </div>
          </slot>
          <button class="close-modal-btn" @click="onCancel" title="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div v-if="$slots.default || type === 'prompt'" class="modal-body-container" style="flex-grow: 1; overflow-y: auto; padding-right: 4px; margin-top: 16px;">
          <slot></slot>

          <div v-if="type === 'prompt'" style="margin-bottom: 16px; margin-top: 12px;">
            <input 
              ref="inputRef"
              type="text" 
              class="input-large" 
              style="width: 100%;" 
              v-model="inputValue" 
              @keyup.enter="onConfirm"
            />
          </div>
        </div>

        <!-- Footer -->
        <div v-if="!hideFooter && type !== 'custom'" class="modal-footer" style="gap: 12px; margin-top: 24px; display: flex; width: 100%;">
          <button v-if="!hideCancel" class="btn-secondary tap-target" style="padding: 0 16px; flex: 1; min-height: 40px; display: flex; align-items: center; justify-content: center;" @click="onCancel">{{ cancelText }}</button>
          <button 
            v-if="confirmText.toLowerCase().includes('delete') || confirmText.toLowerCase().includes('remove')"
            class="btn-danger tap-target"
            style="padding: 0 16px; flex: 1; min-height: 40px; display: flex; align-items: center; justify-content: center;"
            @click="onConfirm"
          >
            {{ confirmText }}
          </button>
          <PrimaryButton 
            v-else
            style="padding: 0 16px; flex: 1; min-height: 40px; display: flex; align-items: center; justify-content: center;"
            @click="onConfirm"
          >
            {{ confirmText }}
          </PrimaryButton>
        </div>
      </div>
    </div>
  </Transition>
</template>
