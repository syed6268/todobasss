import { apiFetch, API_BASE } from './client.js'

export const getStatus = () => apiFetch('/api/auth/google/status')
export const disconnect = () =>
  apiFetch('/api/auth/google/disconnect', { method: 'POST' })

export const fetchTodayEvents = (date = null) =>
  apiFetch(`/api/gcal/events/today${date ? `?date=${encodeURIComponent(date)}` : ''}`)

export const pushScheduleToCalendar = (schedule, date = null) =>
  apiFetch('/api/gcal/events/push-schedule', {
    method: 'POST',
    body: JSON.stringify({ schedule, date }),
  })

export const connectUrl = `${API_BASE}/api/auth/google`
