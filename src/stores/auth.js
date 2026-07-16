import { defineStore } from 'pinia';
import api from '../api';
import { useProgramStore } from './program';
import { useExerciseStore } from './exercise';
import { useWorkoutStore } from './workout';
import { useHistoryStore } from './history';
import { useDiscoverStore } from './discover';
import { useProgressStore } from './progress';
import { useAdminStore } from './admin';

// Corrupt/partial localStorage must never crash store init (which would leave
// the whole app unbootable). Fall back to null and clear the bad value.
function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user')) || null;
  } catch {
    localStorage.removeItem('user');
    return null;
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: readStoredUser(),
    token: localStorage.getItem('auth_token') || null,
  }),
  
  getters: {
    isAuthenticated: (state) => !!state.token,
    // Unverified only when the backend explicitly says so. A cached user from
    // before this feature shipped has no flag — treat that as verified and let
    // the API's 409 gate correct it, rather than locking the user out here.
    isUnverified: (state) => !!state.token && state.user?.email_verified === false,
    // Gates the admin dashboard link + route. Backend is the source of truth
    // (EnsureAdmin middleware); this only decides what the SPA shows.
    isAdmin: (state) => !!state.user?.is_admin,
  },
  
  actions: {
    setAuthData(user, token) {
      this.user = user;
      this.token = token;
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('auth_token', token);
    },
    
    clearAuthData() {
      this.user = null;
      this.token = null;
      localStorage.removeItem('user');
      localStorage.removeItem('auth_token');
    },

    async register(userData) {
      const response = await api.post('/register', userData);
      this.setAuthData(response.data.user, response.data.access_token);
      return response;
    },
    
    async login(credentials) {
      const response = await api.post('/login', credentials);
      this.setAuthData(response.data.user, response.data.access_token);
      return response;
    },
    
    // Wipe every store's state and the persisted auth data. Shared by logout
    // and logout-all so a session teardown is identical either way.
    resetAllStores() {
      useProgramStore().reset();
      useExerciseStore().reset();
      useWorkoutStore().reset();
      useHistoryStore().reset();
      useDiscoverStore().reset();
      useProgressStore().reset();
      useAdminStore().reset();
      this.clearAuthData();
    },

    async logout() {
      try {
        await api.post('/logout');
      } catch (e) {
        console.error(e);
      } finally {
        this.resetAllStores();
      }
    },

    // Revokes ALL of this user's tokens (including the current session), then
    // tears down like a normal logout — the caller redirects to /login.
    async logoutAllDevices() {
      try {
        await api.post('/logout-all');
      } finally {
        this.resetAllStores();
      }
    },

    // Permanently deletes the account (re-confirmed with the current password),
    // then tears down every store exactly like logout — the caller redirects to
    // /login. The backend removes all of the user's data server-side.
    async deleteAccount(payload) {
      await api.delete('/user', { data: payload });
      this.resetAllStores();
    },

    async updateProfile(fields) {
      const response = await api.put('/user/profile', fields);
      this.user = response.data.data;
      localStorage.setItem('user', JSON.stringify(this.user));
      return response;
    },

    // Expects { current_password, password, password_confirmation }. The
    // backend keeps the current token valid (only other devices are revoked),
    // so no token handling is needed here.
    async changePassword(payload) {
      return api.put('/user/password', payload);
    },

    async fetchSessions() {
      const response = await api.get('/user/sessions');
      return response.data.data;
    },

    async fetchUser() {
      try {
        const response = await api.get('/user');
        this.user = response.data.data;
        localStorage.setItem('user', JSON.stringify(this.user));
      } catch (e) {
        this.clearAuthData();
      }
    },

    // Re-send the verification email to the logged-in (unverified) user.
    async resendVerification() {
      return api.post('/email/verification-notification');
    },

    // Confirm a verification link. `query` is the raw '?expires=…&signature=…'
    // string from the emailed URL — forwarded verbatim so the backend's signed
    // check sees the exact query it signed. Suppresses the interceptor toast so
    // the verify page can show its own success/expired state.
    async verifyEmail(id, hash, query) {
      const response = await api.get(`/email/verify/${id}/${hash}${query}`, {
        suppressErrorToast: true,
      });
      // If a session is active, refresh the user so email_verified flips true
      // and the router guard stops confining them to the verify screen.
      if (this.token) {
        await this.fetchUser();
      }
      return response;
    }
  }
});
