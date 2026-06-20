<script setup>
import { watch } from 'vue'
import { useWorkoutStore } from '../stores/workout'

const workoutStore = useWorkoutStore()

watch(() => workoutStore.timerEnabled, (val) => {
  workoutStore.updateSettings({ timer_enabled: val })
})

watch(() => workoutStore.defaultRestTime, (val) => {
  workoutStore.updateSettings({ default_rest_time: val })
})

watch(() => workoutStore.weightUnit, (val) => {
  workoutStore.updateSettings({ weight_unit: val })
})
</script>

<template>
  <div class="settings-page">
    <!-- Header -->
    <div class="flex-row mb-24 gap-12" style="align-items: center;">
      <h1 class="title m-0">Settings</h1>
    </div>

    <!-- Settings Group Card -->
    <div class="card settings-card">
      <div class="card-header pb-16">
        <h2 class="subtitle m-0 text-accent" style="font-weight: 800; font-size: 18px;">Workout Preferences</h2>
        <p class="section-desc-top">Customize your exercise logging and tracking experience</p>
      </div>

      <div class="settings-list">
        <!-- Row 1: Rest Timer Toggle -->
        <div class="setting-item-row">
          <div class="setting-icon-box">
            <!-- Alarm Clock Icon -->
            <svg class="setting-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="13" r="8"></circle>
              <polyline points="12 9 12 13 15 15"></polyline>
              <line x1="5" y1="3" x2="2" y2="6"></line>
              <line x1="19" y1="3" x2="22" y2="6"></line>
            </svg>
          </div>
          <div class="setting-details">
            <span class="setting-title">Enable Rest Timer</span>
            <span class="setting-sub">Automatically start a rest countdown after logging a set</span>
          </div>
          <div class="setting-control">
            <label class="premium-switch">
              <input type="checkbox" v-model="workoutStore.timerEnabled" />
              <span class="premium-slider"></span>
            </label>
          </div>
        </div>

        <!-- Row 2: Rest Time (Select / Picker) -->
        <div class="setting-item-row" :class="{ 'disabled': !workoutStore.timerEnabled }">
          <div class="setting-icon-box">
            <!-- Hourglass/Timer Icon -->
            <svg class="setting-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 2h14"></path>
              <path d="M5 22h14"></path>
              <path d="M19 2v3.86a2 2 0 0 1-.58 1.42L14.83 11a1.2 1.2 0 0 0 0 1.99l3.59 3.73a2 2 0 0 1 .58 1.42V22"></path>
              <path d="M5 2v3.86a2 2 0 0 0 .58 1.42L9.17 11a1.2 1.2 0 0 1 0 1.99l-3.59 3.73A2 2 0 0 0 5 18.14V22"></path>
            </svg>
          </div>
          <div class="setting-details">
            <span class="setting-title">Default Rest Time</span>
            <span class="setting-sub">The baseline duration set for your exercise rest intervals</span>
          </div>
          <div class="setting-control">
            <div class="select-wrapper">
              <select 
                class="premium-select" 
                v-model="workoutStore.defaultRestTime" 
                :disabled="!workoutStore.timerEnabled"
              >
                <option :value="30">30s</option>
                <option :value="60">1:00</option>
                <option :value="90">1:30</option>
                <option :value="120">2:00</option>
                <option :value="150">2:30</option>
                <option :value="180">3:00</option>
                <option :value="240">4:00</option>
                <option :value="300">5:00</option>
              </select>
              <svg class="select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
          </div>
        </div>

        <!-- Row 3: Weight Unit (Segmented Picker) -->
        <div class="setting-item-row">
          <div class="setting-icon-box">
            <!-- Dumbbell SVG Icon -->
            <svg class="setting-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 7.5h12"></path>
              <path d="M12 3v18"></path>
              <rect x="2" y="8" width="4" height="8" rx="1"></rect>
              <rect x="18" y="8" width="4" height="8" rx="1"></rect>
            </svg>
          </div>
          <div class="setting-details">
            <span class="setting-title">Weight Unit</span>
            <span class="setting-sub">Unit of measurement used for all set weights (KG/LBS)</span>
          </div>
          <div class="setting-control">
            <div class="segmented-picker">
              <button 
                class="picker-btn" 
                :class="{ 'active': workoutStore.weightUnit === 'kg' }"
                @click="workoutStore.weightUnit = 'kg'"
              >
                KG
              </button>
              <button 
                class="picker-btn" 
                :class="{ 'active': workoutStore.weightUnit === 'lbs' }"
                @click="workoutStore.weightUnit = 'lbs'"
              >
                LBS
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-card {
  padding: 24px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 16px;
}

.card-header {
  border-bottom: 1px solid var(--border-color);
}

.section-desc-top {
  margin: 6px 0 0 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.settings-list {
  display: flex;
  flex-direction: column;
  margin-top: 12px;
}

.setting-item-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 0;
  border-bottom: 1px solid var(--border-color);
  transition: opacity 0.25s ease;
}

.setting-item-row:last-child {
  border-bottom: none;
}

.setting-item-row.disabled {
  opacity: 0.4;
  pointer-events: none;
}

.setting-icon-box {
  width: 42px;
  height: 42px;
  background-color: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-accent);
  flex-shrink: 0;
}

.setting-icon {
  width: 20px;
  height: 20px;
}

.setting-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-grow: 1;
}

.setting-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.setting-sub {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.setting-control {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

/* Premium Switch Toggle */
.premium-switch {
  position: relative;
  display: inline-block;
  width: 50px;
  height: 28px;
}

.premium-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.premium-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border-color);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  border-radius: 30px;
}

.premium-slider:before {
  position: absolute;
  content: "";
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 3px;
  background-color: #ffffff;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  border-radius: 50%;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.4);
}

.premium-switch input:checked + .premium-slider {
  background-color: var(--primary-accent);
  border-color: var(--primary-accent);
}

.premium-switch input:checked + .premium-slider:before {
  transform: translateX(22px);
  background-color: #000000;
}

/* Premium Select Wrapper */
.select-wrapper {
  position: relative;
  display: inline-block;
  width: 100px;
}

.premium-select {
  width: 100%;
  appearance: none;
  background-color: rgba(255, 255, 255, 0.03);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  padding: 8px 30px 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
}

.premium-select option {
  background-color: #1a1a1a;
  color: var(--text-primary);
}

.premium-select:hover:not(:disabled) {
  background-color: rgba(255, 255, 255, 0.06);
  border-color: var(--primary-accent);
}

.premium-select:focus {
  outline: none;
  border-color: var(--primary-accent);
  box-shadow: 0 0 8px rgba(204, 255, 0, 0.2);
}

.select-arrow {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  color: var(--text-secondary);
  pointer-events: none;
}

/* Segmented Picker */
.segmented-picker {
  display: flex;
  background-color: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
}

.picker-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.picker-btn:hover:not(.active) {
  color: var(--text-primary);
  background-color: rgba(255, 255, 255, 0.03);
}

.picker-btn.active {
  background-color: var(--primary-accent);
  color: #000000;
  box-shadow: 0 2px 8px rgba(204, 255, 0, 0.35);
}
</style>
