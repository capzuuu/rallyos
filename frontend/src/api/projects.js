import apiClient from './client'

export const projectsApi = {
  async list(params = {}) {
    const { data } = await apiClient.get('/projects', { params })
    return data
  },
  async get(id) {
    const { data } = await apiClient.get(`/projects/${id}`)
    return data
  },
  async create(payload) {
    const { data } = await apiClient.post('/projects', payload)
    return data
  },
  async update(id, payload) {
    const { data } = await apiClient.patch(`/projects/${id}`, payload)
    return data
  },
  async remove(id) {
    const { data } = await apiClient.delete(`/projects/${id}`)
    return data
  },
}

