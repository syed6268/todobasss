import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import {
  createTodo, deleteTodo, completeTodo, uncompleteTodo,
} from '../api/todos.js'
import { generateSchedule } from '../api/schedule.js'

const PREVIEW_COUNT = 5

const PRIORITY_LABEL = { 1: 'High', 2: 'Medium', 3: 'Medium', 4: 'Low', 5: 'Low' }
const PRIORITY_STYLE = {
  1: 'bg-red-50 text-red-700 ring-red-200',
  2: 'bg-amber-50 text-amber-700 ring-amber-200',
  3: 'bg-amber-50 text-amber-700 ring-amber-200',
  4: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  5: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}

function formatMinutes(m) {
  if (!m) return null
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h ${r}m` : `${h}h`
}

function PriorityBadge({ p }) {
  const label = PRIORITY_LABEL[p] || 'Medium'
  const style = PRIORITY_STYLE[p] || PRIORITY_STYLE[3]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${style}`}>
      {label}
    </span>
  )
}

function MilestoneBadge({ goalTitle }) {
  if (!goalTitle) return null
  const truncated = goalTitle.length > 14 ? goalTitle.slice(0, 13) + '…' : goalTitle
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
      <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
      {truncated}
    </span>
  )
}

function TimeBadge({ minutes }) {
  const f = formatMinutes(minutes)
  if (!f) return null
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
      <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      {f}
    </span>
  )
}

function TaskRow({ todo, goalTitle, isAI, onToggle, onDelete }) {
  return (
    <div className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-slate-50">
      <button
        onClick={() => onToggle(todo)}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border transition ${
          todo.completed
            ? 'border-indigo-600 bg-indigo-600 text-white'
            : 'border-slate-300 bg-white hover:border-indigo-500'
        }`}
        aria-label="Toggle complete"
      >
        {todo.completed && (
          <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      <p className={`flex-1 truncate text-sm ${todo.completed ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
        {todo.title}
      </p>

      <div className="flex shrink-0 items-center gap-1.5">
        {isAI && (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
            <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 2L3 14h7v8l10-12h-7V2z" />
            </svg>
            AI
          </span>
        )}
        <PriorityBadge p={todo.priority} />
        <MilestoneBadge goalTitle={goalTitle} />
        <TimeBadge minutes={todo.estimatedMinutes} />
        <button
          onClick={() => onDelete(todo)}
          className="ml-1 flex h-5 w-5 items-center justify-center rounded text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-500"
          aria-label="Delete"
        >
          <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const {
    dumpTodos, suggestedTodos,
    goals,
    refreshTodos,
    setSchedule, setSummary, setStats, setDeferred, setActiveGoals, setProposals,
    calendarEvents, useGCal, gcalConnected,
  } = useApp()

  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [adding, setAdding] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState(2)
  const [manualExpanded, setManualExpanded] = useState(false)
  const [aiExpanded, setAiExpanded] = useState(false)

  const flash = useCallback((msg, isError = false) => {
    if (isError) setError(msg)
    else setNotice(msg)
    setTimeout(() => { setError(''); setNotice('') }, 3000)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('gcal') === 'connected') {
      flash('Google Calendar connected!')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (params.get('gcal') === 'error') {
      flash('Google Calendar connection failed.', true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [flash])

  const goalTitleById = (id) => {
    if (!id) return null
    const g = goals.find((g) => String(g._id) === String(id))
    return g?.title || null
  }

  const toggle = async (todo) => {
    try {
      const fn = todo.completed ? uncompleteTodo : completeTodo
      await fn(todo._id)
      await refreshTodos()
    } catch (err) {
      flash(err.message, true)
    }
  }

  const remove = async (todo) => {
    try {
      await deleteTodo(todo._id)
      await refreshTodos()
    } catch (err) {
      flash(err.message, true)
    }
  }

  const addTask = async () => {
    if (!newTitle.trim()) return
    setAdding(true)
    try {
      await createTodo({
        title: newTitle.trim(),
        type: 'dump',
        source: 'manual',
        priority: Number(newPriority),
      })
      setNewTitle('')
      await refreshTodos()
    } catch (err) {
      flash(err.message, true)
    } finally {
      setAdding(false)
    }
  }

  const generate = async () => {
    setGenerating(true)
    try {
      const data = await generateSchedule({
        calendarEvents,
        useGCal: useGCal && gcalConnected,
      })
      setSchedule((data.schedule || []).map((s, i) => ({ ...s, _uid: s.id || `slot-${Date.now()}-${i}` })))
      setSummary(data.summary || '')
      setStats(data.stats || null)
      setDeferred(data.deferred || [])
      setActiveGoals(data.activeGoals || [])
      setProposals(data.proposals || [])
      await refreshTodos()
      flash('Schedule generated! Open Calendar to view it.')
    } catch (err) {
      flash(err.message, true)
    } finally {
      setGenerating(false)
    }
  }

  const allTodos = [...dumpTodos, ...suggestedTodos]
  const completedCount = allTodos.filter((t) => t.completed).length
  const totalCount = allTodos.length
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  const aiTodos = suggestedTodos
  const manualTodos = dumpTodos

  const visibleManual = manualExpanded ? manualTodos : manualTodos.slice(0, PREVIEW_COUNT)
  const visibleAi = aiExpanded ? aiTodos : aiTodos.slice(0, PREVIEW_COUNT)
  const manualHasMore = manualTodos.length > PREVIEW_COUNT
  const aiHasMore = aiTodos.length > PREVIEW_COUNT

  const today = new Date()
  const dateLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-3xl px-6 py-10 sm:py-12">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 pr-2">
            <p className="text-xs font-medium text-slate-400">{dateLabel}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Today</h1>
            <p className="mt-0.5 text-sm text-slate-500">Focus on what moves the needle.</p>
          </div>
          <Link
            to="/calendar"
            className="group inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 hover:shadow-md sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
          >
            <svg className="h-3.5 w-3.5 shrink-0 text-slate-400 transition group-hover:text-indigo-500 sm:h-4 sm:w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
            <span className="max-w-38 text-right leading-snug sm:max-w-none sm:whitespace-nowrap">
              Open Calendar for Today
            </span>
            <svg className="h-3 w-3 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-400 sm:h-3.5 sm:w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {/* Progress bar */}
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-400">
            {completedCount} of {totalCount} complete
          </span>
          <span className="text-[11px] font-semibold text-slate-600">{progressPct}%</span>
        </div>
        <div className="mb-7 h-1 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all duration-700"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Toast */}
        {(error || notice) && (
          <div className={`mb-5 rounded-lg px-4 py-2.5 text-sm font-medium ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {error || notice}
          </div>
        )}

        {/* Manual Tasks — first */}
        <section className="mb-7">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Manual Tasks</h2>
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
              {manualTodos.length}
            </span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
            {visibleManual.map((todo) => (
              <TaskRow
                key={todo._id}
                todo={todo}
                isAI={false}
                goalTitle={goalTitleById(todo.goalId)}
                onToggle={toggle}
                onDelete={remove}
              />
            ))}
            {manualHasMore && (
              <div className="border-t border-slate-100 px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => setManualExpanded((v) => !v)}
                  className="w-full rounded-md py-2 text-center text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
                >
                  {manualExpanded
                    ? 'View less'
                    : `View more (${manualTodos.length - PREVIEW_COUNT} more)`}
                </button>
              </div>
            )}

            {/* Inline add row */}
            <div className="flex items-center gap-3 rounded-lg px-3 py-2.5">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-slate-300">
                <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </span>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTask()}
                placeholder="Add a task..."
                className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
              />
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 focus:border-indigo-400 focus:outline-none"
              >
                <option value={1}>High</option>
                <option value={2}>Medium</option>
                <option value={4}>Low</option>
              </select>
              <button
                onClick={addTask}
                disabled={adding || !newTitle.trim()}
                className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                aria-label="Add"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
          </div>
        </section>

        {/* AI Suggested — second */}
        <section className="mb-7">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">AI Suggested</h2>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                {aiTodos.length}
              </span>
            </div>
            <button
              onClick={generate}
              disabled={generating}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Synthesizing…
                </>
              ) : (
                <>
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13 2L3 14h7v8l10-12h-7V2z" />
                  </svg>
                  Refresh
                </>
              )}
            </button>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
            {aiTodos.length === 0 ? (
              <div className="px-3 py-6 text-center">
                <p className="text-sm text-slate-400">No AI suggestions yet.</p>
                <button
                  onClick={generate}
                  disabled={generating}
                  className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  {generating ? 'Synthesizing…' : 'Generate suggestions →'}
                </button>
              </div>
            ) : (
              <>
                {visibleAi.map((todo) => (
                  <TaskRow
                    key={todo._id}
                    todo={todo}
                    isAI
                    goalTitle={goalTitleById(todo.goalId)}
                    onToggle={toggle}
                    onDelete={remove}
                  />
                ))}
                {aiHasMore && (
                  <div className="border-t border-slate-100 px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => setAiExpanded((v) => !v)}
                      className="w-full rounded-md py-2 text-center text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
                    >
                      {aiExpanded
                        ? 'View less'
                        : `View more (${aiTodos.length - PREVIEW_COUNT} more)`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
