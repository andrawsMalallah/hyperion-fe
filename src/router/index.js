import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

import Home from '../views/Home.vue'
import ProgramBuilder from '../views/ProgramBuilder.vue'
import ActiveWorkout from '../views/ActiveWorkout.vue'
import CreateProgram from '../views/CreateProgram.vue'
import Settings from '../views/Settings.vue'
import History from '../views/History.vue'
import Progress from '../views/Progress.vue'
import Discover from '../views/Discover.vue'
import Contribute from '../views/Contribute.vue'

// Auth Views
import Login from '../views/auth/Login.vue'
import Register from '../views/auth/Register.vue'
import ForgotPassword from '../views/auth/ForgotPassword.vue'
import ResetPassword from '../views/auth/ResetPassword.vue'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { guestOnly: true }
  },
  {
    path: '/register',
    name: 'Register',
    component: Register,
    meta: { guestOnly: true }
  },
  {
    path: '/forgot-password',
    name: 'ForgotPassword',
    component: ForgotPassword,
    meta: { guestOnly: true }
  },
  {
    path: '/reset-password/:token',
    name: 'ResetPassword',
    component: ResetPassword,
    meta: { guestOnly: true }
  },
  {
    path: '/',
    name: 'Home',
    component: Home,
    meta: { requiresAuth: true }
  },
  {
    path: '/builder/:programId?',
    name: 'ProgramBuilder',
    component: ProgramBuilder,
    meta: { requiresAuth: true }
  },
  {
    path: '/workout/:dayId',
    name: 'ActiveWorkout',
    component: ActiveWorkout,
    props: true,
    meta: { requiresAuth: true }
  },
  {
    path: '/create',
    name: 'CreateProgram',
    component: CreateProgram,
    meta: { requiresAuth: true }
  },
  {
    path: '/discover',
    name: 'Discover',
    component: Discover,
    meta: { requiresAuth: true }
  },
  {
    path: '/history',
    name: 'History',
    component: History,
    meta: { requiresAuth: true }
  },
  {
    path: '/progress',
    name: 'Progress',
    component: Progress,
    meta: { requiresAuth: true }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: Settings,
    meta: { requiresAuth: true }
  },
  {
    path: '/contribute',
    name: 'Contribute',
    component: Contribute,
    meta: { requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from) => {
  const authStore = useAuthStore()
  const isAuthenticated = authStore.isAuthenticated

  if (to.meta.requiresAuth && !isAuthenticated) {
    return '/login'
  } else if (to.meta.guestOnly && isAuthenticated) {
    return '/'
  }
})

export default router
