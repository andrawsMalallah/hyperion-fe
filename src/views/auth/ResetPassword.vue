<template>
  <div class="auth-container">
    <div class="card auth-card">
      <h1 class="title text-center" style="margin-bottom: 24px;">Reset Password</h1>
      
      <form @submit.prevent="handleResetPassword" class="flex-col" style="gap: 16px;">
        <div class="flex-col" style="gap: 8px;">
          <label for="email" style="font-weight: 600; font-size: 14px;">Email address</label>
          <input type="email" class="input-large" style="width: 100%;" id="email" v-model="email" required>
        </div>
        
        <div class="flex-col" style="gap: 8px;">
          <label for="password" style="font-weight: 600; font-size: 14px;">New Password</label>
          <input type="password" class="input-large" style="width: 100%;" id="password" v-model="password" required minlength="8">
        </div>
        
        <div class="flex-col" style="gap: 8px;">
          <label for="password_confirmation" style="font-weight: 600; font-size: 14px;">Confirm Password</label>
          <input type="password" class="input-large" style="width: 100%;" id="password_confirmation" v-model="password_confirmation" required minlength="8">
        </div>
        
        <div v-if="errorList.length > 0" class="error-msg">
          <ul style="margin: 0; padding-left: 20px;">
            <li v-for="(err, index) in errorList" :key="index">{{ err }}</li>
          </ul>
        </div>

        <PrimaryButton type="submit" style="width: 100%; margin-top: 8px;" :disabled="loading">
          <span v-if="loading">Resetting...</span>
          <span v-else>Reset Password</span>
        </PrimaryButton>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '@/api';
import PrimaryButton from '@/components/PrimaryButton.vue';

const router = useRouter();
const route = useRoute();

const email = ref(route.query.email || '');
const password = ref('');
const password_confirmation = ref('');
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

const handleResetPassword = async () => {
  errorMsg.value = '';
  validationErrors.value = {};
  loading.value = true;
  
  try {
    await api.post('/reset-password', {
      token: route.params.token,
      email: email.value,
      password: password.value,
      password_confirmation: password_confirmation.value
    });
    router.push('/login');
  } catch (error) {
    if (error.response && error.response.status === 422) {
      validationErrors.value = error.response.data.errors || {};
    } else if (error.response && error.response.data && error.response.data.message) {
      errorMsg.value = error.response.data.message;
    } else {
      errorMsg.value = 'Failed to reset password.';
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
