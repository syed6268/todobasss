import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getRun, openStream, approveRun, declineRun } from '../api/research.js'

// ── Status helpers ────────────────────────────────────────────────────────────
const STATUS_STYLE = {
  running:           'bg-sky-100 text-sky-700',
  awaiting_approval: 'bg-amber-100 text-amber-700',
  approved:          'bg-emerald-100 text-emerald-700',
  declined:          'bg-slate-100 text-slate-500',
  error:             'bg-red-100 text-red-700',
}
const STATUS_LABEL = {
  running:           'Running…',
  awaiting_approval: 'Awaiting approval',
  approved:          'Approved',
  declined:          'Declined',
  error:             'Error',
}

// ── Small icons ───────────────────────────────────────────────────────────────
function BrainIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.44-4.14Z"/>
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.44-4.14Z"/>
    </svg>
  )
}
function WrenchIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z"/>
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
  )
}
function SpinnerIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}
function AlertIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  )
}

// ── Trace event row ───────────────────────────────────────────────────────────
function TraceEvent({ evt, index }) {
  const [open, setOpen] = useState(false)

  if (evt.type === 'thought') {
    return (
      <div className="flex gap-2.5 py-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
          <BrainIcon />
        </span>
        <p className="text-sm text-slate-700 leading-relaxed">{evt.data.text}</p>
      </div>
    )
  }

  if (evt.type === 'tool_call') {
    return (
      <div className="flex gap-2.5 py-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <WrenchIcon />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
            Tool call — {evt.data.tool}
          </p>
          {evt.data.args && Object.keys(evt.data.args).length > 0 && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="mt-1 text-[11px] text-slate-500 underline-offset-2 hover:underline"
            >
              {open ? 'Hide args' : 'Show args'}
            </button>
          )}
          {open && (
            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2 text-[11px] text-slate-700 border border-slate-200">
              {JSON.stringify(evt.data.args, null, 2)}
            </pre>
          )}
        </div>
      </div>
    )
  }

  if (evt.type === 'tool_result') {
    const output = evt.data.output
    const screenshots = output?.screenshots || output?.screenshot_urls || []
    return (
      <div className="flex gap-2.5 py-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckIcon />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            Result — {evt.data.tool}
          </p>
          <button
            onClick={() => setOpen((o) => !o)}
            className="mt-1 text-[11px] text-slate-500 underline-offset-2 hover:underline"
          >
            {open ? 'Hide result' : 'Show result'}
          </button>
          {open && (
            <div className="mt-2 space-y-2">
              {screenshots.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {screenshots.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={url}
                        alt={`Screenshot ${i + 1}`}
                        className="h-32 w-auto rounded-lg border border-slate-200 object-cover shadow-sm transition hover:scale-105"
                      />
                    </a>
                  ))}
                </div>
              )}
              <pre className="overflow-x-auto rounded-lg bg-slate-50 p-2 text-[11px] text-slate-700 border border-slate-200">
                {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (evt.type === 'error' || evt.type === 'needs_reconnect') {
    return (
      <div className="flex gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
          <AlertIcon />
        </span>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-red-700">
            {evt.type === 'needs_reconnect' ? 'Google reconnect needed' : 'Error'}
          </p>
          <p className="mt-0.5 text-sm text-red-700">{evt.data.message}</p>
          {evt.type === 'needs_reconnect' && (
            <Link to="/goals" className="mt-1 inline-block text-[11px] font-semibold text-red-700 underline">
              Go to Goals → Disconnect + Reconnect Google
            </Link>
          )}
        </div>
      </div>
    )
  }

  return null
}

// ── Proposal card ─────────────────────────────────────────────────────────────
const ENERGY_STYLE = { low: 'bg-emerald-50 text-emerald-700', medium: 'bg-amber-50 text-amber-700', high: 'bg-red-50 text-red-700' }
const PRIORITY_DOT = ['', 'bg-red-500', 'bg-orange-400', 'bg-yellow-400', 'bg-blue-400', 'bg-slate-400']

function ProposalCard({ proposal, index, selected, onToggle }) {
  return (
    <button
      onClick={() => onToggle(index)}
      className={`w-full rounded-xl border p-3 text-left transition ${
        selected
          ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-400'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
          selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'
        }`}>
          {selected && (
            <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          )}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">{proposal.title}</p>
          {proposal.rationale && (
            <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">{proposal.rationale}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {proposal.priority && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-slate-500">
                <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[proposal.priority] || PRIORITY_DOT[3]}`} />
                P{proposal.priority}
              </span>
            )}
            {proposal.estimatedMinutes && (
              <span className="text-[10px] font-medium text-slate-500">{proposal.estimatedMinutes}min</span>
            )}
            {proposal.energyCost && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ENERGY_STYLE[proposal.energyCost] || ENERGY_STYLE.medium}`}>
                {proposal.energyCost}
              </span>
            )}
          </div>
          {proposal.sources?.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {proposal.sources.map((src, i) => (
                <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                  {src}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Research() {
  const { runId } = useParams()
  const [run, setRun] = useState(null)
  const [liveEvents, setLiveEvents] = useState([])
  const [proposals, setProposals] = useState([])
  const [summary, setSummary] = useState('')
  const [status, setStatus] = useState('running')
  const [selected, setSelected] = useState([])
  const [approving, setApproving] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const traceEndRef = useRef(null)
  const streamRef = useRef(null)

  const flash = (msg, isErr = false) => {
    if (isErr) setError(msg)
    else setNotice(msg)
    setTimeout(() => { setError(''); setNotice('') }, 5000)
  }

  // Scroll trace to bottom on new events
  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [liveEvents])

  // Fix timing gap: open SSE first so no events are missed, THEN load snapshot
  // and merge already-stored events (the backend replays them on SSE connect anyway,
  // but we deduplicate by tracking a snapshotLoaded ref).
  useEffect(() => {
    let cancelled = false
    const snapshotEventsRef = { count: 0 }

    // Step 1 — open SSE immediately before any async work
    const es = openStream(runId)
    streamRef.current = es

    // Buffer live events that arrive before snapshot loads
    const liveBuffer = []
    let snapshotDone = false

    const pushEvent = (type, d) => {
      if (!snapshotDone) {
        liveBuffer.push({ type, data: d })
      } else {
        setLiveEvents((prev) => {
          // Skip if it duplicates a replayed event from the snapshot
          if (prev.length < snapshotEventsRef.count) return [...prev, { type, data: d }]
          return [...prev, { type, data: d }]
        })
      }
    }

    es.addEventListener('thought', (e) => { pushEvent('thought', JSON.parse(e.data)) })
    es.addEventListener('tool_call', (e) => { pushEvent('tool_call', JSON.parse(e.data)) })
    es.addEventListener('tool_result', (e) => { pushEvent('tool_result', JSON.parse(e.data)) })
    es.addEventListener('needs_reconnect', (e) => { pushEvent('needs_reconnect', JSON.parse(e.data)) })
    es.addEventListener('error', (e) => {
      try { pushEvent('error', JSON.parse(e.data)) } catch { /* SSE connection error */ }
    })
    es.addEventListener('proposals', (e) => {
      const d = JSON.parse(e.data)
      setProposals(d.proposals || [])
      setSummary(d.summary || '')
      setSelected((d.proposals || []).map((_, i) => i))
    })
    es.addEventListener('done', (e) => {
      const d = JSON.parse(e.data)
      setStatus(d.status)
      es.close()
    })

    // Step 2 — load snapshot to hydrate stored events + check if already finished
    const init = async () => {
      try {
        const data = await getRun(runId)
        if (cancelled) return
        const r = data.run
        setRun(r)
        setStatus(r.status)

        const storedEvents = r.events || []
        snapshotEventsRef.count = storedEvents.length
        snapshotDone = true

        // Set all stored events first, then append any buffered live events that aren't duplicates
        // The SSE endpoint replays stored events too, so we drop buffer items that are already in the snapshot
        const bufferedNew = liveBuffer.slice(storedEvents.length)
        setLiveEvents([...storedEvents, ...bufferedNew])

        if (r.proposals?.length > 0) {
          setProposals(r.proposals)
          setSummary(r.summary || '')
          setSelected(r.proposals.map((_, i) => i))
        }

        // If already done, close the SSE we opened
        if (r.status !== 'running') {
          es.close()
        }
      } catch (err) {
        if (!cancelled) flash(err.message, true)
      }
    }

    init()
    return () => {
      cancelled = true
      streamRef.current?.close()
    }
  }, [runId])

  const toggleSelect = useCallback((i) => {
    setSelected((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    )
  }, [])

  const handleApprove = async () => {
    setApproving(true)
    try {
      const selectedIndices = selected.length < proposals.length ? selected : undefined
      await approveRun(runId, selectedIndices)
      setStatus('approved')
      flash(`${selected.length} proposal${selected.length !== 1 ? 's' : ''} added to your todos`)
    } catch (err) {
      flash(err.message, true)
    } finally {
      setApproving(false)
    }
  }

  const handleDecline = async () => {
    setDeclining(true)
    try {
      await declineRun(runId)
      setStatus('declined')
      flash('Research declined — proposals not saved')
    } catch (err) {
      flash(err.message, true)
    } finally {
      setDeclining(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col bg-slate-50">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <Link to="/goals" className="text-[11px] font-semibold text-indigo-600 hover:underline">
          ← Milestones
        </Link>
        <span className="text-slate-300">/</span>
        <p className="text-sm font-semibold text-slate-800 truncate">
          {run?.goalTitle || 'Research Agent'}
        </p>
        <span
          className={`ml-auto shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_STYLE[status] || STATUS_STYLE.running}`}
        >
          {STATUS_LABEL[status] || status}
        </span>
        {status === 'running' && <SpinnerIcon className="h-4 w-4 text-sky-500" />}
      </header>

      {/* Flash messages */}
      {(notice || error) && (
        <div className={`px-6 py-2 text-sm font-medium ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {error || notice}
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — trace timeline */}
        <div className="flex w-0 flex-1 flex-col overflow-y-auto border-r border-slate-200 bg-white px-6 py-4">
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Agent Trace
          </h2>

          {liveEvents.length === 0 && status === 'running' && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <SpinnerIcon className="h-4 w-4" />
              Agent is starting up…
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {liveEvents.map((evt, i) => (
              <TraceEvent key={i} evt={evt} index={i} />
            ))}
          </div>

          <div ref={traceEndRef} />
        </div>

        {/* Right — proposals panel */}
        <div className="flex w-96 shrink-0 flex-col overflow-y-auto bg-slate-50 px-5 py-4">
          <h2 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Proposals
          </h2>

          {summary && (
            <p className="mb-4 text-[12px] text-slate-600 leading-relaxed border-b border-slate-200 pb-3">
              {summary}
            </p>
          )}

          {proposals.length === 0 && (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
              {status === 'running' ? (
                <div className="flex items-center gap-2">
                  <SpinnerIcon className="h-4 w-4" />
                  Waiting for proposals…
                </div>
              ) : (
                'No proposals generated'
              )}
            </div>
          )}

          <div className="space-y-2">
            {proposals.map((p, i) => (
              <ProposalCard
                key={i}
                proposal={p}
                index={i}
                selected={selected.includes(i)}
                onToggle={toggleSelect}
              />
            ))}
          </div>

          {proposals.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-200">
              <p className="mb-3 text-[11px] text-slate-500">
                {selected.length} of {proposals.length} selected
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleApprove}
                  disabled={approving || declining || selected.length === 0 || status === 'approved' || status === 'declined'}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {approving ? <SpinnerIcon className="h-4 w-4" /> : null}
                  {status === 'approved'
                    ? 'Approved'
                    : approving
                    ? 'Approving…'
                    : `Approve ${selected.length} todo${selected.length !== 1 ? 's' : ''}`}
                </button>
                <button
                  onClick={handleDecline}
                  disabled={approving || declining || status === 'approved' || status === 'declined'}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {status === 'declined' ? 'Declined' : declining ? 'Declining…' : 'Decline all'}
                </button>
              </div>
              {status === 'approved' && (
                <Link
                  to="/"
                  className="mt-3 block text-center text-[12px] font-semibold text-indigo-600 hover:underline"
                >
                  View todos on Today page →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
