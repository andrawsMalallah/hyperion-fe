import { defineStore } from 'pinia';
import api from '../api';
import { useProgramStore } from './program';
import { useExerciseStore } from './exercise';
import { useWorkoutStore } from './workout';
import { useHistoryStore } from './history';
import { useDiscoverStore } from './discover';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: JSON.parse(localStorage.getItem('user')) || null,
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
    
    async logout() {
      try {
        await api.post('/logout');
      } catch (e) {
        console.error(e);
      } finally {
        const splitStore = useProgramStore();
        const exerciseStore = useExerciseStore();
        const workoutStore = useWorkoutStore();
        const historyStore = useHistoryStore();
        const discoverStore = useDiscoverStore();
        
        splitStore.reset();
        exerciseStore.reset();
        workoutStore.reset();
        historyStore.reset();
        discoverStore.reset();

        this.clearAuthData();
      }
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
