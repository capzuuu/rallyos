import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

const STORAGE_KEYS = {
  ACCESS: 'rallyos_access_token',
  REFRESH: 'rallyos_refresh_token',
}

export function getStoredTokens() {
  return {
    accessToken: localStorage.getItem(STORAGE_KEYS.ACCESS),
    refreshToken: localStorage.getItem(STORAGE_KEYS.REFRESH),
  }
}

export function setStoredTokens(accessToken, refreshToken) {
  if (accessToken) {
    localStorage.setItem(STORAGE_KEYS.ACCESS, accessToken)
  }
  if (refreshToken) {
    localStorage.setItem(STORAGE_KEYS.REFRESH, refreshToken)
  }
}

export function clearStoredTokens() {
  localStorage.removeItem(STORAGE_KEYS.ACCESS)
  localStorage.removeItem(STORAGE_KEYS.REFRESH)
}

let onAuthFailure = null

export function registerAuthFailureHandler(handler) {
  onAuthFailure = handler
}

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
})

apiClient.interceptors.request.use((config) => {
  const { accessToken } = getStoredTokens()
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

let refreshPromise = null

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const statusCode = error?.response?.status
    const isAuthRoute =
      originalRequest?.url?.includes('/auth/login') ||
      originalRequest?.url?.includes('/auth/register') ||
      originalRequest?.url?.includes('/auth/refresh')

    if (statusCode === 401 && !originalRequest?._retry && !isAuthRoute) {
      const { refreshToken } = getStoredTokens()
      if (!refreshToken) {
        clearStoredTokens()
        onAuthFailure?.()
        return Promise.reject(error)
      }

      originalRequest._retry = true
      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post(`${BASE_URL}/auth/refresh`, { refresh_token: refreshToken })
            .then((res) => {
              const { access_token, refresh_token } = res.data
              setStoredTokens(access_token, refresh_token)
              return access_token
            })
            .finally(() => {
              refreshPromise = null
            })
        }

        const newAccessToken = await refreshPromise
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
        return apiClient(originalRequest)
      } catch (refreshError) {
        clearStoredTokens()
        onAuthFailure?.()
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export default apiClient

