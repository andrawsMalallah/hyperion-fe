<template>
  <div class="auth-container">
    <div class="card auth-card">
      <h1 class="title text-center" style="margin-bottom: 24px;">Forgot Password</h1>

      <form @submit.prevent="handleForgotPassword" class="flex-col" style="gap: 16px;">
        <div class="flex-col" style="gap: 8px;">
          <label for="email" style="font-weight: 600; font-size: 14px;">Email address</label>
          <input type="email" class="input-large" style="width: 100%;" id="email" v-model="email" required>
        </div>

        <PrimaryButton type="submit" style="width: 100%; margin-top: 8px;" :disabled="loading">
          <span v-if="loading">Sending...</span>
          <span v-else>Send Reset Link</span>
        </PrimaryButton>

        <div style="text-align: center; font-size: 14px; margin-top: 16px; color: var(--text-secondary);">
          Remember your password? 
          <router-link to="/login" style="color: var(--primary-accent); text-decoration: none; font-weight: 600;">Sign In</router-link>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import api from '@/api';
import { useToastStore } from '@/stores/toast';
import PrimaryButton from '@/components/PrimaryButton.vue';

const email = ref('');
const loading = ref(false);
const toast = useToastStore();

const handleForgotPassword = async () => {
  loading.value = true;
  try {
    const response = await api.post('/forgot-password', { email: email.value });
    toast.success(response.data.message || 'Password reset link sent! Check your email.');
    email.value = '';
  } catch {
    // Validation / server errors are surfaced as toasts by the interceptor.
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
