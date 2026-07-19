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
          <PasswordInput id="password" v-model="password" required minlength="8" autocomplete="new-password" />
        </div>

        <div class="flex-col" style="gap: 8px;">
          <label for="password_confirmation" style="font-weight: 600; font-size: 14px;">Confirm Password</label>
          <PasswordInput id="password_confirmation" v-model="password_confirmation" required minlength="8" autocomplete="new-password" />
        </div>
        
        <PrimaryButton type="submit" style="width: 100%; margin-top: 8px;" :disabled="loading">
          <PendingLabel v-if="loading" text="Resetting" />
          <span v-else>Reset Password</span>
        </PrimaryButton>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '@/api';
import { useToastStore } from '@/stores/toast';
import PrimaryButton from '@/components/PrimaryButton.vue';
import PendingLabel from '@/components/PendingLabel.vue';
import PasswordInput from '@/components/PasswordInput.vue';

const router = useRouter();
const route = useRoute();
const toast = useToastStore();

const email = ref(route.query.email || '');
const password = ref('');
const password_confirmation = ref('');
const loading = ref(false);

const handleResetPassword = async () => {
  loading.value = true;

  try {
    await api.post('/reset-password', {
      token: route.params.token,
      email: email.value,
      password: password.value,
      password_confirmation: password_confirmation.value
    });
    toast.success('Password reset — log in with your new password.');
    router.push('/login');
  } catch {
    // Invalid token / validation errors are surfaced as toasts by the interceptor.
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
