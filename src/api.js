import axios from 'axios';
import { useToastStore } from './stores/toast';

// Configured per environment: .env.development points at the local API,
// .env.production at the deployed one. Override with VITE_API_URL.
const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || 'https://hyperion-api-m4ze.onrender.com') + '/api',
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
});

// Interceptor to add auth token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Central error → toast handler. Any request can opt out with
// `{ suppressErrorToast: true }` in its config when its caller already shows a
// friendlier, contextual message (see the stores). The store is imported
// lazily so Pinia is guaranteed active by the time a request can fail.
function toastApiError(error) {
  if (error.config?.suppressErrorToast) return;
  // Only errors with a server response toast here. No-response (network /
  // offline) failures are left to callers — the offline-first workout flow
  // treats them as "saved offline", and a generic toast would contradict it.
  if (!error.response) return;

  const { status, data } = error.response;

  // 401 is handled above (storage clear + redirect is the feedback). The one
  // exception is a failed login, which returns 401 while already on /login —
  // surface its message so the user knows the credentials were wrong.
  if (status === 401 && window.location.pathname !== '/login') return;

  const toast = useToastStore();

  // 422 validation: one toast per field message, capped at 3 + a summary.
  if (status === 422 && data?.errors) {
    const messages = Object.values(data.errors).flat();
    messages.slice(0, 3).forEach(msg => toast.error(msg));
    if (messages.length > 3) {
      toast.error(`+${messages.length - 3} more issues`);
    }
    return;
  }

  toast.error(data?.message || 'Something went wrong. Please try again.');
}

// Interceptor to handle 401 errors + surface all other backend messages
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    toastApiError(error);
    return Promise.reject(error);
  }
);

export default api;
