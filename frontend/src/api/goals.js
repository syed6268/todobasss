import { apiFetch } from './client.js'

export const listGoals = () => apiFetch('/api/goals')
export const createGoal = (body) =>
  apiFetch('/api/goals', { method: 'POST', body: JSON.stringify(body) })
export const updateGoal = (id, body) =>
  apiFetch(`/api/goals/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
export const deleteGoal = (id) => apiFetch(`/api/goals/${id}`, { method: 'DELETE' })
export const proposeForGoal = (id) =>
  apiFetch(`/api/goals/${id}/propose`, { method: 'POST' })
export const addGoalNote = (id, text) =>
  apiFetch(`/api/goals/${id}/notes`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
