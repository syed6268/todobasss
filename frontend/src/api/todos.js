import { apiFetch } from './client.js'

export const listTodos = () => apiFetch('/api/todos')
export const createTodo = (body) =>
  apiFetch('/api/todos', { method: 'POST', body: JSON.stringify(body) })
export const updateTodo = (id, body) =>
  apiFetch(`/api/todos/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
export const completeTodo = (id) => updateTodo(id, { completed: true })
export const uncompleteTodo = (id) => updateTodo(id, { completed: false })
export const deleteTodo = (id) => apiFetch(`/api/todos/${id}`, { method: 'DELETE' })
