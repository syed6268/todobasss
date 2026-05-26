import { apiFetch, API_BASE } from './client.js'

export const startResearch = (goalId) =>
  apiFetch('/api/research/start', { method: 'POST', body: JSON.stringify({ goalId }) })

export const getRun = (runId) =>
  apiFetch(`/api/research/runs/${runId}`)

export const approveRun = (runId, selected) =>
  apiFetch(`/api/research/runs/${runId}/approve`, {
    method: 'POST',
    body: JSON.stringify(selected != null ? { selected } : {}),
  })

export const declineRun = (runId) =>
  apiFetch(`/api/research/runs/${runId}/decline`, { method: 'POST' })

/** Returns a native EventSource pointed at the SSE stream for a run. */
export const openStream = (runId) =>
  new EventSource(`${API_BASE}/api/research/runs/${runId}/stream`)
