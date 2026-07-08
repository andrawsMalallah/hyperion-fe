<template>
  <div class="auth-container">
    <div class="card auth-card">
      <h1 class="title text-center" style="margin-bottom: 24px;">Welcome Back</h1>
      
      <form @submit.prevent="handleLogin" class="flex-col" style="gap: 16px;">
        <div class="flex-col" style="gap: 8px;">
          <label for="email" style="font-weight: 600; font-size: 14px;">Email address</label>
          <input type="email" class="input-large" style="width: 100%;" id="email" v-model="email" required>
        </div>
        
        <div class="flex-col" style="gap: 8px;">
          <label for="password" style="font-weight: 600; font-size: 14px;">Password</label>
          <PasswordInput id="password" v-model="password" required autocomplete="current-password" />
        </div>
        
        <div class="flex-row" style="justify-content: flex-end;">
          <router-link to="/forgot-password" style="color: var(--text-secondary); text-decoration: none; font-size: 12px;">Forgot Password?</router-link>
        </div>
        
        <PrimaryButton type="submit" style="width: 100%; margin-top: 8px;" :disabled="loading">
          <span v-if="loading">Signing in...</span>
          <span v-else>Sign In</span>
        </PrimaryButton>

        <div style="text-align: center; font-size: 14px; margin-top: 16px; color: var(--text-secondary);">
          Don't have an account? 
          <router-link to="/register" style="color: var(--primary-accent); text-decoration: none; font-weight: 600;">Sign Up</router-link>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import PrimaryButton from '@/components/PrimaryButton.vue';
import PasswordInput from '@/components/PasswordInput.vue';

const email = ref('');
const password = ref('');
const loading = ref(false);

const router = useRouter();
const authStore = useAuthStore();

const handleLogin = async () => {
  loading.value = true;
  try {
    await authStore.login({ email: email.value, password: password.value });
    router.push('/');
  } catch {
    // Invalid credentials / validation errors are surfaced as toasts by the
    // axios interceptor.
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.auth-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 200px);
}

.auth-card {
  width: 100%;
  max-width: 400px;
  padding: 32px 24px;
}

.text-center {
  text-align: center;
}
</style>
