import apiClient from './client'

export const authApi = {
  async register(payload) {
    const { data } = await apiClient.post('/auth/register', payload)
    return data
  },
  async login(payload) {
    const { data } = await apiClient.post('/auth/login', payload)
    return data
  },
  async getMe() {
    const { data } = await apiClient.get('/auth/me')
    return data
  },
  async updateMe(payload) {
    const { data } = await apiClient.patch('/auth/me', payload)
    return data
  },
  async changePassword(payload) {
    const { data } = await apiClient.post('/auth/change-password', payload)
    return data
  },
}

