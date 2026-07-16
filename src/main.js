import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import './style.css'
import 'overlayscrollbars/overlayscrollbars.css'
import App from './App.vue'
import router from './router'
import { initSentry, setSentryUser } from './sentry'
import { useAuthStore } from './stores/auth'

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

const app = createApp(App)
app.use(pinia)

// Before mounting, so errors thrown during the first render are still reported.
initSentry(app)

// A returning user is restored from localStorage rather than logging in, so tag
// them here too — setAuthData only covers a fresh login.
setSentryUser(useAuthStore().user)

app.use(router)
app.mount('#app')

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(e => {
      console.error('Service worker registration failed:', e)
    })
  })
}
