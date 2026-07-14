<template>
  <div>
    <!-- Header -->
    <div class="flex-row mb-24 gap-12" style="align-items: center;">
      <BackButton />
      <h1 class="title m-0">Profile</h1>
    </div>

    <!-- Account Information -->
    <div class="card profile-card">
      <div class="card-header">
        <h2 class="subtitle m-0 text-accent">Account Information</h2>
        <p class="section-desc-top">Your personal details.</p>
      </div>

      <form @submit.prevent="saveProfile" class="flex-col" style="gap: 16px;">
        <div class="flex-col" style="gap: 8px;">
          <label for="profile-name" style="font-weight: 600; font-size: 14px;">Name</label>
          <input type="text" class="input-large" style="width: 100%;" id="profile-name" v-model="name" required maxlength="255">
        </div>

        <div class="flex-col" style="gap: 8px;">
          <label for="profile-email" style="font-weight: 600; font-size: 14px;">Email address</label>
          <input type="email" class="input-large" style="width: 100%;" id="profile-email" v-model="email" required>
        </div>

        <p v-if="memberSince" class="member-since">Member since {{ memberSince }}</p>

        <PrimaryButton type="submit" style="width: 100%;" :disabled="savingProfile || !profileChanged">
          <span v-if="savingProfile">Saving...</span>
          <span v-else>Save Changes</span>
        </PrimaryButton>
      </form>
    </div>

    <!-- Change Password -->
    <div class="card profile-card">
      <div class="card-header">
        <h2 class="subtitle m-0 text-accent">Change Password</h2>
        <p class="section-desc-top">Changing your password signs you out of all other devices.</p>
      </div>

      <form @submit.prevent="savePassword" class="flex-col" style="gap: 16px;">
        <div class="flex-col" style="gap: 8px;">
          <label for="current-password" style="font-weight: 600; font-size: 14px;">Current password</label>
          <PasswordInput id="current-password" v-model="currentPassword" required autocomplete="current-password" />
        </div>

        <div class="flex-col" style="gap: 8px;">
          <label for="new-password" style="font-weight: 600; font-size: 14px;">New password</label>
          <PasswordInput id="new-password" v-model="newPassword" required minlength="8" autocomplete="new-password" />
        </div>

        <div class="flex-col" style="gap: 8px;">
          <label for="confirm-password" style="font-weight: 600; font-size: 14px;">Confirm new password</label>
          <PasswordInput id="confirm-password" v-model="confirmPassword" required minlength="8" autocomplete="new-password" />
        </div>

        <PrimaryButton type="submit" style="width: 100%;" :disabled="savingPassword">
          <span v-if="savingPassword">Changing...</span>
          <span v-else>Change Password</span>
        </PrimaryButton>
      </form>
    </div>

    <!-- Devices -->
    <div class="card profile-card">
      <div class="card-header">
        <h2 class="subtitle m-0 text-accent">Devices</h2>
        <p class="section-desc-top">Where you're currently signed in.</p>
      </div>

      <div v-if="loadingSessions" class="device-empty">Loading sessions…</div>

      <ul v-else-if="sessions.length" class="device-list">
        <li v-for="session in sessions" :key="session.id" class="device-row">
          <div class="device-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="4" width="20" height="12" rx="2"></rect>
              <line x1="8" y1="20" x2="16" y2="20"></line>
              <line x1="12" y1="16" x2="12" y2="20"></line>
            </svg>
          </div>
          <div class="device-info">
            <span class="device-name">{{ deviceLabel(session.name) }}</span>
            <span class="device-meta">Signed in {{ formatDate(session.created_at) }}</span>
          </div>
          <span v-if="session.is_current" class="device-current-badge">This device</span>
        </li>
      </ul>

      <div v-else class="device-empty">No active sessions found.</div>

      <button class="btn-danger tap-target device-logout-all" @click="showLogoutAllModal = true" :disabled="loggingOut">
        <span v-if="loggingOut">Signing out…</span>
        <span v-else>Log out all devices</span>
      </button>
    </div>

    <AppModal
      v-model:show="showLogoutAllModal"
      title="Log out all devices"
      message="This signs you out everywhere, including this device. You'll need to log in again. Continue?"
      type="confirm"
      confirm-text="Log Out Everywhere"
      cancel-text="Cancel"
      @confirm="confirmLogoutAll"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import { deviceLabel } from '../utils/device';
import PrimaryButton from '../components/PrimaryButton.vue';
import PasswordInput from '../components/PasswordInput.vue';
import AppModal from '../components/AppModal.vue';
import BackButton from '../components/BackButton.vue';

const router = useRouter();
const authStore = useAuthStore();
const toast = useToastStore();

// --- Account information form ---
const name = ref(authStore.user?.name || '');
const email = ref(authStore.user?.email || '');
const savingProfile = ref(false);

const profileChanged = computed(() =>
  name.value !== (authStore.user?.name || '') || email.value !== (authStore.user?.email || '')
);

const memberSince = computed(() => {
  const created = authStore.user?.created_at;
  if (!created) return '';
  return new Date(created).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
});

const saveProfile = async () => {
  savingProfile.value = true;
  try {
    await authStore.updateProfile({ name: name.value.trim(), email: email.value.trim() });
    toast.success('Profile updated');
  } catch {
    // Backend errors are surfaced as toasts by the axios interceptor.
  } finally {
    savingProfile.value = false;
  }
};

// --- Change password form ---
const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const savingPassword = ref(false);

const savePassword = async () => {
  savingPassword.value = true;
  try {
    await authStore.changePassword({
      current_password: currentPassword.value,
      password: newPassword.value,
      password_confirmation: confirmPassword.value
    });
    // Clear the fields only on success.
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    toast.success('Password changed. Other devices were signed out.');
  } catch {
    // Backend errors are surfaced as toasts by the axios interceptor.
  } finally {
    savingPassword.value = false;
  }
};

// --- Devices ---
const sessions = ref([]);
const loadingSessions = ref(true);
const loggingOut = ref(false);
const showLogoutAllModal = ref(false);

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const loadSessions = async () => {
  loadingSessions.value = true;
  try {
    sessions.value = await authStore.fetchSessions();
  } catch {
    // Load failures are surfaced as toasts by the interceptor.
  } finally {
    loadingSessions.value = false;
  }
};

const confirmLogoutAll = async () => {
  loggingOut.value = true;
  try {
    await authStore.logoutAllDevices();
    toast.success('Logged out on all devices.');
    router.push('/login');
  } catch {
    loggingOut.value = false;
    // Errors are surfaced as toasts by the interceptor.
  }
};

// Refresh from the server so created_at/email are correct for users whose
// localStorage copy predates those fields being displayed anywhere.
onMounted(async () => {
  const preName = name.value;
  const preEmail = email.value;
  await authStore.fetchUser();
  // Only overwrite pristine fields — don't clobber in-progress edits.
  if (name.value === preName && email.value === preEmail) {
    name.value = authStore.user?.name || '';
    email.value = authStore.user?.email || '';
  }
  loadSessions();
});
</script>

<style scoped>
.profile-card {
  padding: 24px;
}

.card-header {
  margin-bottom: 20px;
}

.member-since {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

/* Devices */
.device-list {
  list-style: none;
  margin: 0 0 16px 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.device-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.device-icon {
  flex: 0 0 auto;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
}

.device-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.device-name {
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-meta {
  font-size: 12px;
  color: var(--text-secondary);
}

.device-current-badge {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 700;
  color: var(--primary-accent);
  background-color: rgba(204, 255, 0, 0.1);
  border: 1px solid var(--primary-accent);
  border-radius: 999px;
  padding: 3px 8px;
  white-space: nowrap;
}

.device-empty {
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--text-secondary);
}

.device-logout-all {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
