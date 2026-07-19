<template>
  <div class="auth-container">
    <div class="card auth-card">
      <!-- CALLBACK MODE: the user arrived from the emailed link (:id/:hash) -->
      <template v-if="isCallback">
        <h1 class="title text-center verify-heading">Verifying your email</h1>

        <div v-if="callbackState === 'verifying'" class="flex-col verify-body">
          <p class="verify-text">Confirming your verification link…</p>
        </div>

        <div v-else-if="callbackState === 'success'" class="flex-col verify-body">
          <p class="verify-text">Your email is verified. Redirecting…</p>
        </div>

        <div v-else class="flex-col verify-body">
          <p class="verify-text">
            This verification link is invalid or has expired. Log in and request
            a new one.
          </p>
          <PrimaryButton class="verify-btn" @click="goToLogin">Go to Login</PrimaryButton>
        </div>
      </template>

      <!-- PENDING MODE: post-register / gated user waiting to verify -->
      <template v-else>
        <h1 class="title text-center verify-heading">Verify your email</h1>

        <div class="flex-col verify-body">
          <p class="verify-text">
            We sent a verification link to
            <strong v-if="userEmail">{{ userEmail }}</strong>
            <strong v-else>your email address</strong>.
            Click it to activate your account, then continue below.
          </p>

          <PrimaryButton class="verify-btn" :disabled="resending" @click="resend">
            <PendingLabel v-if="resending" text="Sending" />
            <span v-else>Resend verification email</span>
          </PrimaryButton>

          <button class="link-btn" :disabled="checking" @click="checkVerified">
            <PendingLabel v-if="checking" text="Checking" />
            <span v-else>I've verified — continue</span>
          </button>

          <button class="link-btn link-btn-muted" @click="logout">Log out</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import PrimaryButton from '@/components/PrimaryButton.vue';
import PendingLabel from '@/components/PendingLabel.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const toast = useToastStore();

// Callback mode when the emailed link supplied both id and hash in the path.
const isCallback = computed(() => !!route.params.id && !!route.params.hash);
const userEmail = computed(() => authStore.user?.email);

const callbackState = ref('verifying'); // verifying | success | error
const resending = ref(false);
const checking = ref(false);

const goToLogin = () => router.push('/login');

// Land the user in the app if a session is active, otherwise send them to log in.
const continueAfterVerify = () => {
  router.push(authStore.isAuthenticated ? '/' : '/login');
};

const resend = async () => {
  resending.value = true;
  try {
    const response = await authStore.resendVerification();
    toast.success(response.data?.message || 'Verification email sent. Check your inbox.');
  } catch {
    // Errors surface as toasts via the interceptor.
  } finally {
    resending.value = false;
  }
};

// Re-fetch the user; if the backend now reports them verified, let them in.
const checkVerified = async () => {
  checking.value = true;
  try {
    await authStore.fetchUser();
    if (authStore.isUnverified) {
      toast.error("Not verified yet — click the link in your email first.");
    } else {
      router.push('/');
    }
  } finally {
    checking.value = false;
  }
};

const logout = async () => {
  await authStore.logout();
  router.push('/login');
};

onMounted(async () => {
  if (!isCallback.value) return;

  try {
    // Forward the raw signed query (?expires=…&signature=…) exactly as received.
    await authStore.verifyEmail(route.params.id, route.params.hash, window.location.search);
    callbackState.value = 'success';
    toast.success('Email verified successfully.');
    setTimeout(continueAfterVerify, 1200);
  } catch {
    callbackState.value = 'error';
  }
});
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

.verify-heading {
  margin-bottom: 20px;
}

.verify-body {
  gap: 16px;
}

.verify-text {
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-secondary);
  text-align: center;
}

.verify-btn {
  width: 100%;
}

/* Text-style secondary actions (continue / log out). */
.link-btn {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  color: var(--primary-accent);
}

.link-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.link-btn-muted {
  color: var(--text-secondary);
}
</style>
