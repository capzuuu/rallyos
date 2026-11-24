import apiClient from './client'

export const usersApi = {
  async getDirectory() {
    const { data } = await apiClient.get('/users/directory')
    return data
  },
  async list(params = {}) {
    const { data } = await apiClient.get('/users', { params })
    return data
  },
  async create(payload) {
    const { data } = await apiClient.post('/users', payload)
    return data
  },
  async update(id, payload) {
    const { data } = await apiClient.patch(`/users/${id}`, payload)
    return data
  },
  async remove(id) {
    const { data } = await apiClient.delete(`/users/${id}`)
    return data
  },
}

