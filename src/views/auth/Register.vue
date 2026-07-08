<template>
  <div class="auth-container">
    <div class="card auth-card">
      <h1 class="title text-center" style="margin-bottom: 24px;">Create Account</h1>
      
      <form @submit.prevent="handleRegister" class="flex-col" style="gap: 16px;">
        <div class="flex-col" style="gap: 8px;">
          <label for="name" style="font-weight: 600; font-size: 14px;">Full Name</label>
          <input type="text" class="input-large" style="width: 100%;" id="name" v-model="name" required>
        </div>
        
        <div class="flex-col" style="gap: 8px;">
          <label for="email" style="font-weight: 600; font-size: 14px;">Email address</label>
          <input type="email" class="input-large" style="width: 100%;" id="email" v-model="email" required>
        </div>
        
        <div class="flex-col" style="gap: 8px;">
          <label for="password" style="font-weight: 600; font-size: 14px;">Password</label>
          <PasswordInput id="password" v-model="password" required minlength="8" autocomplete="new-password" />
        </div>

        <div class="flex-col" style="gap: 8px;">
          <label for="password_confirmation" style="font-weight: 600; font-size: 14px;">Confirm Password</label>
          <PasswordInput id="password_confirmation" v-model="password_confirmation" required minlength="8" autocomplete="new-password" />
        </div>
        
        <PrimaryButton type="submit" style="width: 100%; margin-top: 8px;" :disabled="loading">
          <span v-if="loading">Signing up...</span>
          <span v-else>Sign Up</span>
        </PrimaryButton>

        <div style="text-align: center; font-size: 14px; margin-top: 16px; color: var(--text-secondary);">
          Already have an account? 
          <router-link to="/login" style="color: var(--primary-accent); text-decoration: none; font-weight: 600;">Sign In</router-link>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import PrimaryButton from '@/components/PrimaryButton.vue';
import PasswordInput from '@/components/PasswordInput.vue';

const name = ref('');
const email = ref('');
const password = ref('');
const password_confirmation = ref('');
const loading = ref(false);

const router = useRouter();
const authStore = useAuthStore();
const toast = useToastStore();

const handleRegister = async () => {
  // Client-side guard — the backend can't compare the two fields for us here.
  if (password.value !== password_confirmation.value) {
    toast.error('Passwords do not match.');
    return;
  }

  loading.value = true;
  try {
    await authStore.register({
      name: name.value,
      email: email.value,
      password: password.value,
      password_confirmation: password_confirmation.value
    });
    router.push('/');
  } catch {
    // Backend errors are surfaced as toasts by the axios interceptor.
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
