<template>
  <div class="auth-container">
    <div class="card auth-card">
      <h1 class="title text-center" style="margin-bottom: 24px;">Forgot Password</h1>
      
      <div v-if="statusMsg" class="success-msg" style="margin-bottom: 16px;">
        {{ statusMsg }}
      </div>
      
      <form @submit.prevent="handleForgotPassword" class="flex-col" style="gap: 16px;">
        <div class="flex-col" style="gap: 8px;">
          <label for="email" style="font-weight: 600; font-size: 14px;">Email address</label>
          <input type="email" class="input-large" style="width: 100%;" id="email" v-model="email" required>
        </div>
        
        <div v-if="errorList.length > 0" class="error-msg">
          <ul style="margin: 0; padding-left: 20px;">
            <li v-for="(err, index) in errorList" :key="index">{{ err }}</li>
          </ul>
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
import { ref, computed } from 'vue';
import api from '@/api';
import PrimaryButton from '@/components/PrimaryButton.vue';

const email = ref('');
const statusMsg = ref('');
const errorMsg = ref('');
const validationErrors = ref({});
const loading = ref(false);

const errorList = computed(() => {
  if (Object.keys(validationErrors.value).length > 0) {
    return Object.values(validationErrors.value).flat();
  }
  if (errorMsg.value) {
    return [errorMsg.value];
  }
  return [];
});

const handleForgotPassword = async () => {
  errorMsg.value = '';
  validationErrors.value = {};
  statusMsg.value = '';
  loading.value = true;
  try {
    const response = await api.post('/forgot-password', { email: email.value });
    statusMsg.value = response.data.status || 'Password reset link sent! Check your email.';
    email.value = '';
  } catch (error) {
    if (error.response && error.response.status === 422) {
      validationErrors.value = error.response.data.errors || {};
    } else if (error.response && error.response.data && error.response.data.message) {
      errorMsg.value = error.response.data.message;
    } else {
      errorMsg.value = 'Failed to send reset link.';
    }
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

.error-msg {
  background-color: rgba(255, 77, 77, 0.1);
  color: var(--danger);
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  border: 1px solid rgba(255, 77, 77, 0.2);
}

.success-msg {
  background-color: rgba(0, 230, 118, 0.1);
  color: var(--success);
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  border: 1px solid rgba(0, 230, 118, 0.2);
}
</style>
