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

        <!--
          Two things make this slow: the free-tier API can be cold-starting
          (30-50s) and the reset email is sent synchronously within the request.
          Only shown once the request has been in flight past the threshold, so a
          normal fast send never sees it.
        -->
        <p v-if="showWakingHint" class="waking-hint" role="status">
          Still working — waking the server and sending your email. This can take up to a minute. Hang tight…
        </p>

        <div style="text-align: center; font-size: 14px; margin-top: 16px; color: var(--text-secondary);">
          Remember your password? 
          <router-link to="/login" style="color: var(--primary-accent); text-decoration: none; font-weight: 600;">Sign In</router-link>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue';
import api from '@/api';
import { useToastStore } from '@/stores/toast';
import PrimaryButton from '@/components/PrimaryButton.vue';

// A request still in flight after this long is a cold-starting dyno and/or the
// synchronous email send — that's when the reassurance is worth showing.
const WAKING_HINT_DELAY_MS = 3000;

const email = ref('');
const loading = ref(false);
const showWakingHint = ref(false);
let wakingHintTimer = null;
const toast = useToastStore();

const clearWakingHint = () => {
  if (wakingHintTimer) {
    clearTimeout(wakingHintTimer);
    wakingHintTimer = null;
  }
  showWakingHint.value = false;
};

const handleForgotPassword = async () => {
  loading.value = true;
  wakingHintTimer = setTimeout(() => {
    showWakingHint.value = true;
  }, WAKING_HINT_DELAY_MS);
  try {
    const response = await api.post('/forgot-password', { email: email.value });
    toast.success(response.data.message || 'Password reset link sent! Check your email.');
    email.value = '';
  } catch {
    // Validation / server errors are surfaced as toasts by the interceptor.
  } finally {
    loading.value = false;
    clearWakingHint();
  }
};

// Guard against the timer firing after the user navigates away mid-request.
onUnmounted(clearWakingHint);
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

.waking-hint {
  margin: 0;
  text-align: center;
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-secondary);
}
</style>
