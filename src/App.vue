<script setup>
import RestTimer from './components/RestTimer.vue'
import BottomNav from './components/BottomNav.vue'
import AppModal from './components/AppModal.vue'
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { OverlayScrollbars } from 'overlayscrollbars'
import { useWorkoutStore } from './stores/workout'
import { useAuthStore } from './stores/auth'
import { useRouter } from 'vue-router'

const authStore = useAuthStore()
const router = useRouter()

const isAuthenticated = computed(() => authStore.isAuthenticated)
const user = computed(() => authStore.user)

// User dropdown
const showDropdown = ref(false)
const dropdownRef = ref(null)

const toggleDropdown = () => {
  showDropdown.value = !showDropdown.value
}

const goToSettings = () => {
  showDropdown.value = false
  router.push('/settings')
}

const closeDropdown = (e) => {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target)) {
    showDropdown.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', closeDropdown)
  const workoutStore = useWorkoutStore()
  workoutStore.stopRestTimer()

  // Initialize OverlayScrollbars globally
  OverlayScrollbars(document.body, {
    scrollbars: {
      visibility: 'auto',
      autoHide: 'leave',
      autoHideDelay: 800
    }
  })
})

onUnmounted(() => {
  document.removeEventListener('click', closeDropdown)
})

// Logout confirmation
const showLogoutModal = ref(false)

const promptLogout = () => {
  showDropdown.value = false
  showLogoutModal.value = true
}

const confirmLogout = async () => {
  await authStore.logout()
  router.push('/login')
}

watch(isAuthenticated, (newVal) => {
  if (newVal) {
    authStore.fetchUser()
    const workoutStore = useWorkoutStore()
    workoutStore.fetchSettings()
  }
}, { immediate: true })
</script>

<template>
  <div class="app-container">
    <header class="app-header" style="justify-content: space-between;" v-if="isAuthenticated">
      <router-link to="/" class="nav-brand">Hyperion</router-link>
      <div class="user-menu" ref="dropdownRef">
        <button class="user-menu-trigger" @click="toggleDropdown">
          <span class="user-menu-name">{{ user?.name || 'User' }}</span>
          <svg class="user-menu-arrow" :class="{ 'is-open': showDropdown }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <Transition name="dropdown-fade">
          <div v-if="showDropdown" class="user-dropdown">
            <div class="dropdown-user-header">
              <span class="user-email">{{ user?.email || 'Account Info' }}</span>
            </div>
            <div class="dropdown-divider"></div>
            
            <button class="dropdown-item" @click="goToSettings">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              Settings
            </button>
            
            <div class="dropdown-divider"></div>
            
            <button class="dropdown-item dropdown-logout" @click="promptLogout">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              Log Out
            </button>
          </div>
        </Transition>
      </div>
    </header>
    <header class="app-header justify-content-center" v-else>
      <div class="nav-brand">Hyperion</div>
    </header>
    
    <main class="app-content">
      <router-view v-slot="{ Component }">
        <transition name="page-fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <RestTimer v-if="isAuthenticated" />
    <BottomNav v-if="isAuthenticated" />

    <!-- Logout Confirmation Modal -->
    <AppModal 
      v-model:show="showLogoutModal" 
      title="Log Out" 
      message="Are you sure you want to log out?"
      confirmText="Log Out"
      cancelText="Cancel"
      @confirm="confirmLogout"
    />
  </div>
</template>

<style scoped>
.user-menu {
  position: relative;
}

.user-menu-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 20px;
  transition: all 0.2s ease;
}

.user-menu-trigger:hover {
  background-color: rgba(255, 255, 255, 0.05);
}

.user-menu-name {
  font-weight: 700;
  font-size: 13px;
  color: var(--text-primary);
}

.user-menu-arrow {
  color: var(--text-secondary);
  transition: transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  flex-shrink: 0;
}

.user-menu-arrow.is-open {
  transform: rotate(180deg);
}

.user-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 180px;
  background: rgba(26, 26, 26, 0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 8px 6px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  z-index: 1000;
}

.dropdown-user-header {
  padding: 4px 10px 8px 10px;
  display: flex;
  flex-direction: column;
}

.user-email {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 600;
  letter-spacing: 0.1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-divider {
  height: 1px;
  background-color: rgba(255, 255, 255, 0.06);
  margin: 6px 0;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  color: var(--text-secondary);
  transition: all 0.15s ease;
}

.dropdown-item:hover {
  background-color: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

.dropdown-logout {
  color: var(--danger, #ff4d4d);
}

.dropdown-logout:hover {
  background-color: rgba(255, 77, 77, 0.1);
  color: #ff4d4d;
}

/* Dropdown transition */
.dropdown-fade-enter-active {
  transition: opacity 0.18s ease, transform 0.18s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.dropdown-fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.dropdown-fade-enter-from {
  opacity: 0;
  transform: translateY(-6px) scale(0.96);
}

.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
