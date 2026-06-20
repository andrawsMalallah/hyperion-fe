import axios from 'axios';

const api = axios.create({
  baseURL: 'https://hyperion-api-m4ze.onrender.com/api',
  // baseURL: 'http://localhost:8000/api',
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

// Interceptor to handle 401 errors
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
    return Promise.reject(error);
  }
);

export default api;
