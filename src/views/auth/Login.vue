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
          <input type="password" class="input-large" style="width: 100%;" id="password" v-model="password" required>
        </div>
        
        <div class="flex-row" style="justify-content: flex-end;">
          <router-link to="/forgot-password" style="color: var(--text-secondary); text-decoration: none; font-size: 12px;">Forgot Password?</router-link>
        </div>
        
        <div v-if="errorList.length > 0" class="error-msg">
          <ul style="margin: 0; padding-left: 20px;">
            <li v-for="(err, index) in errorList" :key="index">{{ err }}</li>
          </ul>
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
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import PrimaryButton from '@/components/PrimaryButton.vue';

const email = ref('');
const password = ref('');
const errorMsg = ref('');
const validationErrors = ref({});
const loading = ref(false);

const router = useRouter();
const authStore = useAuthStore();

const errorList = computed(() => {
  if (Object.keys(validationErrors.value).length > 0) {
    return Object.values(validationErrors.value).flat();
  }
  if (errorMsg.value) {
    return [errorMsg.value];
  }
  return [];
});

const handleLogin = async () => {
  errorMsg.value = '';
  validationErrors.value = {};
  loading.value = true;
  try {
    await authStore.login({ email: email.value, password: password.value });
    router.push('/');
  } catch (error) {
    if (error.response && error.response.status === 422) {
      validationErrors.value = error.response.data.errors || {};
    } else if (error.response && error.response.data && error.response.data.message) {
      errorMsg.value = error.response.data.message;
    } else {
      errorMsg.value = 'Failed to login. Please try again.';
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
</style>
