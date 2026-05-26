import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useApp, todayKey, dateKey } from '../context/AppContext.jsx'
import { completeTodo, uncompleteTodo } from '../api/todos.js'
import { generateSchedule } from '../api/schedule.js'
import {
  disconnect as disconnectGcal,
  fetchTodayEvents,
  pushScheduleToCalendar,
  connectUrl as gcalConnectUrl,
} from '../api/gcal.js'

// ─── Constants ───────────────────────────────────────────────────────────────
const HOUR_HEIGHT = 72
const DAY_START = 8
const DAY_END   = 22
const HOURS = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i)

// Refined, low-saturation palette — Linear/Notion vibe
const MILESTONE_COLORS = [
  { bg: 'bg-indigo-50',  border: 'border-indigo-500',  text: 'text-indigo-900',  dot: 'bg-indigo-500',  tag: 'bg-indigo-100 text-indigo-700'  },
  { bg: 'bg-emerald-50', border: 'border-emerald-500', text: 'text-emerald-900', dot: 'bg-emerald-500', tag: 'bg-emerald-100 text-emerald-700' },
  { bg: 'bg-amber-50',   border: 'border-amber-500',   text: 'text-amber-900',   dot: 'bg-amber-500',   tag: 'bg-amber-100 text-amber-800'    },
  { bg: 'bg-rose-50',    border: 'border-rose-500',    text: 'text-rose-900',    dot: 'bg-rose-500',    tag: 'bg-rose-100 text-rose-700'      },
  { bg: 'bg-cyan-50',    border: 'border-cyan-500',    text: 'text-cyan-900',    dot: 'bg-cyan-500',    tag: 'bg-cyan-100 text-cyan-700'      },
  { bg: 'bg-violet-50',  border: 'border-violet-500',  text: 'text-violet-900',  dot: 'bg-violet-500',  tag: 'bg-violet-100 text-violet-700'  },
]
const DUMP_STYLE = { bg: 'bg-white',       border: 'border-slate-400', text: 'text-slate-800', dot: 'bg-slate-500', tag: 'bg-slate-100 text-slate-600' }
const BUSY_STYLE = { bg: 'bg-slate-100',   border: 'border-slate-300', text: 'text-slate-600', dot: 'bg-slate-400' }

// ─── Time utilities ──────────────────────────────────────────────────────────
function parseMin(t) {
  if (!t) return 0
  const ampm = String(t).match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (ampm) {
    let h = parseInt(ampm[1])
    const m = parseInt(ampm[2])
    const p = ampm[3].toUpperCase()
    if (p === 'PM' && h !== 12) h += 12
    if (p === 'AM' && h === 12) h = 0
    return h * 60 + m
  }
  const plain = String(t).match(/^(\d+):(\d+)/)
  if (plain) return parseInt(plain[1]) * 60 + parseInt(plain[2])
  return 0
}
function minToPos(startMin, endMin) {
  if (!startMin || !endMin || endMin <= startMin) return null
  const top    = ((startMin - DAY_START * 60) / 60) * HOUR_HEIGHT
  const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 32)
  return { top, height }
}
function slotToPos(slot) {
  const parts = (slot.time || '').split(/[-–]/).map((s) => s.trim())
  return minToPos(parseMin(parts[0]), parseMin(parts[1]))
}
function eventToPos(evt) { return minToPos(parseMin(evt.startTime), parseMin(evt.endTime)) }
function currentTop() {
  const now = new Date()
  return ((now.getHours() * 60 + now.getMinutes() - DAY_START * 60) / 60) * HOUR_HEIGHT
}
function fmtHour(h) { return `${String(h).padStart(2, '0')}:00` }
function fmtTime(t) {
  const m = parseMin(t); if (!m && m !== 0) return t
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + n)
  return dateKey(date)
}
function fmtDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}
function fmtDateShort(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── Tiny components ─────────────────────────────────────────────────────────
function LockIcon() {
  return (
    <svg className="mt-px h-3 w-3 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  )
}
function SparkleIcon({ className = 'h-3 w-3' }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2zm6 12l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8.8-2.4z" />
    </svg>
  )
}
function SpinnerIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function Calendar() {
  const {
    selectedDate, setSelectedDate, isToday,
    calendarEvents, setCalendarEvents,
    schedule, setSchedule,
    summary, setSummary,
    setStats, setDeferred, setActiveGoals, setProposals,
    activeGoals, goals,
    gcalConnected, setGcalConnected,
    useGCal, setUseGCal,
    refreshTodos,
  } = useApp()

  const [loading,    setLoading]    = useState(false)
  const [pushing,    setPushing]    = useState(false)
  const [fetching,   setFetching]   = useState(false)
  const [toast,      setToast]      = useState({ msg: '', err: false })
  const [nowTop,     setNowTop]     = useState(currentTop)
  const [agentTrace, setAgentTrace] = useState([])

  const leftRef = useRef(null)

  const flash = useCallback((msg, err = false) => {
    setToast({ msg, err })
    setTimeout(() => setToast({ msg: '', err: false }), 3500)
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNowTop(currentTop()), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!leftRef.current) return
    if (isToday) {
      const target = currentTop()
      const max = HOURS.length * HOUR_HEIGHT
      // Only auto-scroll to "now" if it's within the visible day window;
      // otherwise pin to the top so the day starts at 08:00.
      if (target > 0 && target < max) {
        leftRef.current.scrollTop = Math.max(0, target - 120)
      } else {
        leftRef.current.scrollTop = 0
      }
    } else {
      leftRef.current.scrollTop = 0
    }
  }, [selectedDate, isToday])

  // ── milestone → color map ──
  const colorMap = useMemo(() => {
    const map = {}
    let count = 0
    ;[...(goals || []), ...(activeGoals || [])].forEach((g) => {
      const id = String(g._id)
      if (!map[id]) map[id] = MILESTONE_COLORS[count++ % MILESTONE_COLORS.length]
    })
    schedule.forEach((s) => {
      if (s.goalId && !map[String(s.goalId)]) {
        map[String(s.goalId)] = MILESTONE_COLORS[count++ % MILESTONE_COLORS.length]
      }
    })
    return map
  }, [goals, activeGoals, schedule])

  const getSlotStyle = (slot) => {
    if (slot.type === 'calendar') return BUSY_STYLE
    if (slot.goalId && colorMap[String(slot.goalId)]) return colorMap[String(slot.goalId)]
    return DUMP_STYLE
  }

  // ── Day nav ──
  const goPrev  = () => setSelectedDate(addDays(selectedDate, -1))
  const goNext  = () => setSelectedDate(addDays(selectedDate,  1))
  const goToday = () => setSelectedDate(todayKey())

  const onPickDate = (e) => {
    if (e.target.value) setSelectedDate(e.target.value)
  }

  // ── GCal pull for the selected date ──
  const pullGCal = async () => {
    setFetching(true)
    try {
      const data = await fetchTodayEvents(selectedDate)
      setCalendarEvents(data.events.map((e, i) => ({ ...e, id: e.id || `gcal-${i}` })))
      flash(`Loaded ${data.count} event(s) from Google Calendar`)
    } catch (err) { flash(err.message, true) }
    finally { setFetching(false) }
  }

  // ── Generate schedule for the selected date ──
  const generate = async () => {
    setLoading(true)
    setAgentTrace(['Thinking…'])
    try {
      const data = await generateSchedule({ calendarEvents, useGCal: useGCal && gcalConnected, date: selectedDate })
      setSchedule((data.schedule || []).map((s, i) => ({ ...s, _uid: s.id || `slot-${Date.now()}-${i}` })))
      setSummary(data.summary || '')
      setStats(data.stats || null)
      setDeferred(data.deferred || [])
      setActiveGoals(data.activeGoals || [])
      setProposals(data.proposals || [])
      if (data.source === 'gcal' && data.calendarEvents) {
        setCalendarEvents(data.calendarEvents.map((e, i) => ({ ...e, id: e.id || `gcal-${i}` })))
      }
      setAgentTrace(buildTrace(data))
      flash('Schedule generated!')
      await refreshTodos()
    } catch (err) {
      setAgentTrace(['Error during scheduling.'])
      flash(err.message, true)
    } finally {
      setLoading(false)
    }
  }

  function buildTrace(data) {
    const steps = ['Reading Google Calendar…']
    const gc = (data?.activeGoals || []).length
    if (gc > 0) steps.push(`Spawning ${gc} milestone agent${gc !== 1 ? 's' : ''}…`)
    steps.push('Fetching resources…')
    steps.push('Computing free slots…')
    if (data?.stats) {
      const freeH = Math.floor((data.stats.totalFreeMinutes || 0) / 60)
      steps.push(`Found ${data.stats.freeSlots || 0} free slots · ${freeH}h available`)
    }
    ;(data?.activeGoals || []).forEach((g) => {
      steps.push(`Agent for "${g.title}" → fetched resources`)
    })
    const dump = data?.stats?.dumpScheduled || 0
    if (dump) steps.push(`Parsed ${dump} brain-dump todos to fit in gaps`)
    const placed = (data?.schedule || []).filter((s) => ['dump', 'suggested'].includes(s.type)).length
    const slots  = data?.stats?.freeSlots || 0
    if (placed > 0) steps.push(`Placed ${placed} tasks across ${slots} slots — keeping 5-min buffers`)
    return steps
  }

  const pushToGCal = async () => {
    const pushable = schedule.filter(
      (s) => ['dump', 'suggested', 'break'].includes(s.type) && !s.gcalInserted
    )
    if (!pushable.length) { flash('Nothing new to insert'); return }
    setPushing(true)
    try {
      const data = await pushScheduleToCalendar(pushable, selectedDate)
      const ok = new Set((data.results || []).filter((r) => r.success && r.id).map((r) => r.id))
      setSchedule((prev) => prev.map((s) => (ok.has(s.id) ? { ...s, gcalInserted: true } : s)))
      if (data.needsReconnect && data.inserted === 0) {
        flash('Google denied write access. Disconnect and reconnect.', true)
      } else {
        flash(`Inserted ${data.inserted} event(s) into Google Calendar`)
      }
    } catch (err) { flash(err.message, true) }
    finally { setPushing(false) }
  }

  const toggleDone = async (slot) => {
    if (!slot.todoId) return
    try {
      const fn = slot.completed ? uncompleteTodo : completeTodo
      await fn(slot.todoId)
      setSchedule((prev) => prev.map((s) => (s._uid === slot._uid ? { ...s, completed: !s.completed } : s)))
      await refreshTodos()
    } catch (err) { flash(err.message, true) }
  }

  // ── Derived ──
  const placed = schedule.filter((s) => ['dump', 'suggested'].includes(s.type))
  const pushableCount = schedule.filter((s) => ['dump', 'suggested', 'break'].includes(s.type) && !s.gcalInserted).length
  const showNowLine = isToday && nowTop >= 0 && nowTop <= HOURS.length * HOUR_HEIGHT

  // Group placed by goal
  const goalGroups = {}
  const dumpGroup  = []
  placed.forEach((s) => {
    if (s.goalId) {
      const gid = String(s.goalId)
      if (!goalGroups[gid]) goalGroups[gid] = { goalTitle: s.goalTitle || 'Milestone', color: colorMap[gid] || MILESTONE_COLORS[0], slots: [] }
      goalGroups[gid].slots.push(s)
    } else {
      dumpGroup.push(s)
    }
  })

  // Legend
  const legendEntries = []
  if (calendarEvents.length > 0) legendEntries.push({ label: 'Busy', dot: 'bg-slate-400' })
  Object.values(goalGroups).forEach((g) => legendEntries.push({ label: g.goalTitle, dot: g.color.dot }))
  if (dumpGroup.length > 0) legendEntries.push({ label: 'Brain dump', dot: 'bg-slate-500' })

  const summaryLine = summary
    ? summary
    : `${calendarEvents.length} event${calendarEvents.length !== 1 ? 's' : ''} booked · ${
        isToday ? 'gaps will be filled by AI' : 'AI scheduling available for today'
      }`

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[1fr_380px]">
      {/* ── LEFT PANE — timeline ── */}
      <div ref={leftRef} className="h-full overflow-y-auto bg-slate-50">
        <div className="mx-auto max-w-3xl px-6 py-8 lg:px-10">

          {/* Back link */}
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-800"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>

          {/* Title row + day nav */}
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {isToday ? "Today's calendar" : fmtDate(selectedDate)}
              </h1>
              <p className="mt-1 text-sm text-slate-500">{summaryLine}</p>
            </div>

            {/* Day navigator */}
            <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              <button
                onClick={goPrev}
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                aria-label="Previous day"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                  <path d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <label className="relative cursor-pointer">
                <span className="rounded-md px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100">
                  {isToday ? 'Today' : fmtDateShort(selectedDate)}
                </span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={onPickDate}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Pick date"
                />
              </label>

              <button
                onClick={goNext}
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                aria-label="Next day"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {!isToday && (
                <button
                  onClick={goToday}
                  className="ml-1 rounded-md border-l border-slate-200 pl-2 pr-1 text-[11px] font-semibold text-indigo-600 transition hover:text-indigo-700"
                >
                  Jump to today
                </button>
              )}
            </div>
          </div>

          {/* GCal strip */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {gcalConnected ? (
              <>
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Google Calendar connected
                </span>
                <button
                  onClick={pullGCal} disabled={fetching}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                >
                  {fetching ? 'Loading…' : 'Sync events'}
                </button>
                <button
                  onClick={async () => { await disconnectGcal(); setGcalConnected(false); flash('Disconnected') }}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={() => { window.location.href = gcalConnectUrl }}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Connect Google Calendar
              </button>
            )}
          </div>

          {/* Timeline card */}
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                {isToday ? 'Today' : fmtDateShort(selectedDate)} · {gcalConnected && isToday ? 'synced from Google Calendar' : 'manual events'}
              </p>
              {placed.length > 0 && (
                <p className="text-[11px] text-slate-500">
                  {placed.length} AI-placed task{placed.length !== 1 ? 's' : ''} · {calendarEvents.length} busy event{calendarEvents.length !== 1 ? 's' : ''} kept locked
                </p>
              )}
            </div>

            <div className="relative px-5 pt-3 pb-5" style={{ height: HOURS.length * HOUR_HEIGHT + 40 }}>
              {HOURS.map((h, i) => (
                <div
                  key={h}
                  className="absolute left-5 right-5 flex items-start"
                  style={{ top: 16 + i * HOUR_HEIGHT }}
                >
                  <span className="w-12 shrink-0 pr-3 text-right text-[11px] font-medium tabular-nums text-slate-400">
                    {fmtHour(h)}
                  </span>
                  <div className="flex-1 border-t border-slate-100" />
                </div>
              ))}

              <div className="absolute" style={{ top: 16, bottom: 20, left: 76, right: 20 }}>
                {/* Busy / calendar events */}
                {calendarEvents.map((evt) => {
                  const pos = eventToPos(evt)
                  if (!pos) return null
                  return (
                    <div
                      key={evt.id}
                      className="group absolute left-0 right-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 transition hover:bg-slate-200/70"
                      style={{ top: pos.top + 1, height: pos.height - 2 }}
                    >
                      <div className="flex items-start gap-1.5">
                        <LockIcon />
                        <div className="min-w-0">
                          <p className="truncate text-xs italic text-slate-600 leading-snug">{evt.title}</p>
                          {pos.height > 38 && (
                            <p className="text-[10px] tabular-nums text-slate-400">
                              {fmtTime(evt.startTime)}–{fmtTime(evt.endTime)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* AI-placed + dump slots */}
                {schedule.map((slot) => {
                  if (slot.type === 'calendar') return null
                  const pos = slotToPos(slot)
                  if (!pos) return null
                  const cfg = getSlotStyle(slot)
                  const parts = (slot.time || '').split(/[-–]/).map((s) => s.trim())
                  const isAI = slot.type === 'suggested'
                  return (
                    <div
                      key={slot._uid}
                      className={`group absolute left-0 right-0 overflow-hidden rounded-lg border border-slate-200 border-l-[3px] ${cfg.border} ${cfg.bg} px-3 py-1.5 shadow-sm transition-all hover:shadow-md ${slot.completed ? 'opacity-50' : ''}`}
                      style={{ top: pos.top + 1, height: pos.height - 2 }}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {isAI && (
                              <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${cfg.tag || 'bg-slate-100 text-slate-600'}`}>
                                <SparkleIcon className="h-2 w-2" />
                                AI
                              </span>
                            )}
                            <p className={`truncate text-xs font-semibold leading-snug ${cfg.text} ${slot.completed ? 'line-through' : ''}`}>
                              {slot.task}
                            </p>
                          </div>
                          {pos.height > 50 && (
                            <div className="mt-1 flex items-center gap-1.5">
                              <p className={`text-[10px] tabular-nums ${cfg.text} opacity-70`}>
                                {fmtTime(parts[0])}–{fmtTime(parts[1])}
                              </p>
                              {slot.goalTitle && (
                                <span className={`max-w-32 truncate rounded-full px-1.5 py-px text-[9px] font-medium ${cfg.tag || 'bg-slate-100 text-slate-600'}`}>
                                  {slot.goalTitle}
                                </span>
                              )}
                              {slot.gcalInserted && (
                                <span className="rounded-full bg-blue-100 px-1.5 py-px text-[9px] font-medium text-blue-700">
                                  on cal
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {slot.todoId && pos.height > 38 && (
                          <button
                            onClick={() => toggleDone(slot)}
                            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold transition ${
                              slot.completed
                                ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300'
                                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:ring-emerald-300'
                            }`}
                          >
                            {slot.completed ? '✓ Done' : 'Mark done'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Now line */}
                {showNowLine && (
                  <div className="pointer-events-none absolute left-0 right-0 z-10" style={{ top: nowTop }}>
                    <div className="flex items-center">
                      <span className="h-2 w-2 rounded-full bg-red-500 shadow shadow-red-400/50" />
                      <div className="h-px flex-1 bg-red-400" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {legendEntries.length > 0 && (
              <div className="flex flex-wrap gap-4 border-t border-slate-100 px-5 py-3">
                {legendEntries.map((e, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${e.dot}`} />
                    <span className="text-[11px] text-slate-500">{e.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="h-12" />
        </div>
      </div>

      {/* ── RIGHT PANE — controls + insights ── */}
      <div className="flex h-full flex-col border-l border-slate-200 bg-white">
        <div className="shrink-0 border-b border-slate-100 p-4">
          <div className="grid grid-cols-2 gap-2.5">
            {/* Schedule day */}
            <button
              onClick={generate}
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <SpinnerIcon className="h-4 w-4 text-slate-500" />
                  <span>Scheduling</span>
                </>
              ) : (
                <>
                  <SparkleIcon className="h-4 w-4 text-indigo-500" />
                  <span>Schedule day</span>
                </>
              )}
            </button>

            {/* Push to calendar — blue */}
            <button
              onClick={pushToGCal}
              disabled={!gcalConnected || pushing || pushableCount === 0}
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {pushing ? (
                <>
                  <SpinnerIcon className="h-4 w-4" />
                  <span>Pushing…</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" />
                  </svg>
                  <span>Push to calendar</span>
                </>
              )}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              id="use-gcal-r"
              type="checkbox"
              checked={useGCal}
              onChange={(e) => setUseGCal(e.target.checked)}
              disabled={!gcalConnected}
              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 disabled:opacity-50"
            />
            <label htmlFor="use-gcal-r" className={`text-[11px] ${gcalConnected ? 'text-slate-600' : 'text-slate-400'}`}>
              Use live Google Calendar events when scheduling
            </label>
          </div>

          {toast.msg && (
            <div className={`mt-3 rounded-lg px-3 py-2 text-[11px] font-medium ${toast.err ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {toast.msg}
            </div>
          )}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* Agent trace */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
              <svg className="h-4 w-4 text-indigo-500" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path d="M12 2a7 7 0 017 7c0 3.5-2.5 6-5 8l-2 2-2-2c-2.5-2-5-4.5-5-8a7 7 0 017-7z" />
                <circle cx="12" cy="9" r="2" />
              </svg>
              <p className="text-sm font-semibold text-slate-800">Agent trace</p>
            </div>
            <div className="space-y-1.5 px-4 py-3">
              {agentTrace.length === 0 ? (
                <p className="text-[11px] italic text-slate-400">
                  Hit Schedule day to watch the agents reason.
                </p>
              ) : (
                agentTrace.map((step, i) => {
                  const isThinking = step === 'Thinking…'
                  return (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-px text-[10px] font-bold text-indigo-400">›</span>
                      <p className={`text-[11px] leading-relaxed ${isThinking && loading ? 'animate-pulse italic text-slate-400' : 'text-slate-600'}`}>
                        {step}
                      </p>
                    </div>
                  )
                })
              )}
              {loading && agentTrace.length > 0 && agentTrace[agentTrace.length - 1] !== 'Thinking…' && (
                <div className="flex items-start gap-2">
                  <span className="mt-px text-[10px] font-bold text-indigo-400">›</span>
                  <p className="animate-pulse text-[11px] italic leading-relaxed text-slate-400">thinking…</p>
                </div>
              )}
            </div>
          </div>

          {/* What got placed */}
          {placed.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">What got placed</p>
              </div>
              <div className="space-y-5 px-4 py-4">
                {Object.entries(goalGroups).map(([gid, group]) => (
                  <div key={gid}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${group.color.dot}`} />
                      <p className="text-[11px] font-bold text-slate-700">{group.goalTitle}</p>
                      <span className="text-[10px] text-slate-400">{group.slots.length} block{group.slots.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="space-y-2 pl-4">
                      {group.slots.map((s) => {
                        const parts = (s.time || '').split(/[-–]/).map((t) => t.trim())
                        return (
                          <div key={s._uid}>
                            <div className="flex items-baseline gap-2">
                              <span className="w-10 shrink-0 text-[10px] tabular-nums font-semibold text-slate-500">
                                {fmtTime(parts[0])}
                              </span>
                              <span className="truncate text-[11px] font-medium text-slate-800">{s.task}</span>
                            </div>
                            <p className="mt-0.5 pl-12 text-[10px] italic text-slate-400">
                              Moves "{group.goalTitle}" forward
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {dumpGroup.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-slate-500" />
                      <p className="text-[11px] font-bold text-slate-700">Brain dump</p>
                      <span className="text-[10px] text-slate-400">{dumpGroup.length} block{dumpGroup.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="space-y-2 pl-4">
                      {dumpGroup.map((s) => {
                        const parts = (s.time || '').split(/[-–]/).map((t) => t.trim())
                        return (
                          <div key={s._uid} className="flex items-baseline gap-2">
                            <span className="w-10 shrink-0 text-[10px] tabular-nums font-semibold text-slate-500">
                              {fmtTime(parts[0])}
                            </span>
                            <span className="truncate text-[11px] font-medium text-slate-800">{s.task}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
