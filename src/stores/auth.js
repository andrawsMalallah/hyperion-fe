import { defineStore } from 'pinia';
import api from '../api';
import { useProgramStore } from './program';
import { useExerciseStore } from './exercise';
import { useWorkoutStore } from './workout';
import { useHistoryStore } from './history';
import { useDiscoverStore } from './discover';
import { useProgressStore } from './progress';

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
    }
  }
});
