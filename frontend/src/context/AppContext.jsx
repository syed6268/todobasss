import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'
import { listTodos } from '../api/todos.js'
import { listGoals } from '../api/goals.js'
import { getStatus as getGcalStatus } from '../api/gcal.js'

const AppContext = createContext(null)

function readSession(key, fallback) {
  try {
    const v = sessionStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}

function writeSession(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota / privacy mode — ignore */
  }
}

export function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const DEFAULT_EVENTS = [
  { id: 1, title: 'Team standup',  startTime: '9:00 AM', endTime: '9:30 AM' },
  { id: 2, title: 'Client meeting', startTime: '2:00 PM', endTime: '3:00 PM' },
]

export function AppProvider({ children }) {
  // ── per-date stores ──
  const [selectedDate, setSelectedDate] = useState(todayKey())

  const [eventsByDate,   _setEventsByDate]   = useState(() =>
    readSession('events_by_date', { [todayKey()]: DEFAULT_EVENTS })
  )
  const [scheduleByDate, _setScheduleByDate] = useState(() =>
    readSession('schedule_by_date', {})
  )

  // ── single-shot derived state (still per date) ──
  const [summary,     setSummary]     = useState(() => readSession('summary', ''))
  const [stats,       setStats]       = useState(() => readSession('stats', null))
  const [deferred,    setDeferred]    = useState(() => readSession('deferred', []))
  const [activeGoals, setActiveGoals] = useState([])
  const [proposals,   setProposals]   = useState([])

  // ── global (not per-day) ──
  const [dumpTodos,      setDumpTodos]      = useState([])
  const [suggestedTodos, setSuggestedTodos] = useState([])
  const [goals,          setGoals]          = useState([])
  const [gcalConnected,  setGcalConnected]  = useState(false)
  const [useGCal,        setUseGCal]        = useState(false)

  useEffect(() => writeSession('events_by_date',   eventsByDate),   [eventsByDate])
  useEffect(() => writeSession('schedule_by_date', scheduleByDate), [scheduleByDate])
  useEffect(() => writeSession('summary',  summary),  [summary])
  useEffect(() => writeSession('stats',    stats),    [stats])
  useEffect(() => writeSession('deferred', deferred), [deferred])

  // ── date-scoped setters ──
  const calendarEvents = useMemo(
    () => eventsByDate[selectedDate] || [],
    [eventsByDate, selectedDate]
  )
  const schedule = useMemo(
    () => scheduleByDate[selectedDate] || [],
    [scheduleByDate, selectedDate]
  )

  const setCalendarEvents = useCallback(
    (updater) => {
      _setEventsByDate((prev) => {
        const curr = prev[selectedDate] || []
        const next = typeof updater === 'function' ? updater(curr) : updater
        return { ...prev, [selectedDate]: next }
      })
    },
    [selectedDate]
  )

  const setSchedule = useCallback(
    (updater) => {
      _setScheduleByDate((prev) => {
        const curr = prev[selectedDate] || []
        const next = typeof updater === 'function' ? updater(curr) : updater
        return { ...prev, [selectedDate]: next }
      })
    },
    [selectedDate]
  )

  // ── data fetchers ──
  const refreshTodos = useCallback(async () => {
    try {
      const data = await listTodos()
      setDumpTodos(data.dumpTodos || [])
      setSuggestedTodos(data.suggestedTodos || [])
    } catch (err) {
      console.error('Failed to fetch todos:', err.message)
    }
  }, [])

  const refreshGoals = useCallback(async () => {
    try {
      const data = await listGoals()
      setGoals(data.goals || [])
    } catch (err) {
      console.error('Failed to fetch goals:', err.message)
    }
  }, [])

  const checkGCal = useCallback(async () => {
    try {
      const data = await getGcalStatus()
      setGcalConnected(Boolean(data.connected))
    } catch {
      setGcalConnected(false)
    }
  }, [])

  useEffect(() => {
    refreshTodos()
    refreshGoals()
    checkGCal()
  }, [refreshTodos, refreshGoals, checkGCal])

  const isToday = selectedDate === todayKey()

  return (
    <AppContext.Provider
      value={{
        // date controls
        selectedDate, setSelectedDate,
        isToday,
        // per-date state
        calendarEvents, setCalendarEvents,
        schedule, setSchedule,
        // global derived
        summary, setSummary,
        stats, setStats,
        deferred, setDeferred,
        activeGoals, setActiveGoals,
        proposals, setProposals,
        // global
        dumpTodos, setDumpTodos,
        suggestedTodos, setSuggestedTodos,
        goals, setGoals,
        gcalConnected, setGcalConnected,
        useGCal, setUseGCal,
        refreshTodos,
        refreshGoals,
        checkGCal,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
