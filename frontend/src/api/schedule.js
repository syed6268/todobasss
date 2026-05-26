import { apiFetch, API_BASE } from './client.js'

export const generateSchedule = ({ calendarEvents = [], useGCal = false, date = null } = {}) =>
  apiFetch('/api/schedule/generate', {
    method: 'POST',
    body: JSON.stringify({ calendarEvents, useGCal, date }),
  })

export { API_BASE }
