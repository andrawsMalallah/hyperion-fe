import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

// Eagerly loaded views — the core path a user hits first, kept in the main
// bundle so the initial screen paints without an extra network round-trip.
import Home from '../views/Home.vue'
import ActiveWorkout from '../views/ActiveWorkout.vue'
import Login from '../views/auth/Login.vue'

// Everything else is lazy-loaded: each becomes its own chunk fetched only when
// the route is first visited, so login no longer downloads the whole app.
const ProgramBuilder = () => import('../views/ProgramBuilder.vue')
const CreateProgram = () => import('../views/CreateProgram.vue')
const Settings = () => import('../views/Settings.vue')
const Profile = () => import('../views/Profile.vue')
const History = () => import('../views/History.vue')
const Progress = () => import('../views/Progress.vue')
const Discover = () => import('../views/Discover.vue')
const Contribute = () => import('../views/Contribute.vue')

// Auth Views (Login stays eager above — it is the first screen for guests)
const Register = () => import('../views/auth/Register.vue')
const ForgotPassword = () => import('../views/auth/ForgotPassword.vue')
const ResetPassword = () => import('../views/auth/ResetPassword.vue')
const VerifyEmail = () => import('../views/auth/VerifyEmail.vue')

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
    // Two modes: the emailed link carries :id/:hash (verify callback); with no
    // params it's the "check your inbox / resend" pending screen. Reachable both
    // logged-out (link opened in a fresh browser) and logged-in (post-register).
    path: '/verify-email/:id?/:hash?',
    name: 'VerifyEmail',
    component: VerifyEmail
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
    path: '/profile',
    name: 'Profile',
    component: Profile,
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
  const isUnverified = authStore.isUnverified

  if (to.meta.requiresAuth && !isAuthenticated) {
    return '/login'
  }

  if (to.meta.guestOnly && isAuthenticated) {
    // A logged-in-but-unverified user belongs on the verify screen, not home.
    return isUnverified ? '/verify-email' : '/'
  }

  // Hard requirement: until the email is verified, confine the user to the
  // verify screen (both its pending and callback modes share this route name).
  if (isUnverified && to.name !== 'VerifyEmail') {
    return '/verify-email'
  }
})

export default router
