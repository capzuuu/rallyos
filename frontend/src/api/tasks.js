import apiClient from './client'

export const tasksApi = {
  async list(params = {}) {
    const { data } = await apiClient.get('/tasks', { params })
    return data
  },
  async get(id) {
    const { data } = await apiClient.get(`/tasks/${id}`)
    return data
  },
  async create(payload) {
    const { data } = await apiClient.post('/tasks', payload)
    return data
  },
  async update(id, payload) {
    const { data } = await apiClient.patch(`/tasks/${id}`, payload)
    return data
  },
  async remove(id) {
    const { data } = await apiClient.delete(`/tasks/${id}`)
    return data
  },
}

