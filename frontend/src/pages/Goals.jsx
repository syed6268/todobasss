import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import {
  createGoal,
  updateGoal,
  deleteGoal,
  proposeForGoal,
  addGoalNote,
} from '../api/goals.js'
import { startResearch as apiStartResearch } from '../api/research.js'

const HORIZON_LABELS = {
  '1week': '1 week',
  '1month': '1 month',
  '3months': '3 months',
  '6months': '6 months',
  '1year': '1 year',
  '5years': '5 years',
}
const HORIZONS = Object.keys(HORIZON_LABELS)

const horizonColor = {
  '1week':   'bg-sky-100 text-sky-700 ring-sky-200',
  '1month':  'bg-emerald-100 text-emerald-700 ring-emerald-200',
  '3months': 'bg-amber-100 text-amber-700 ring-amber-200',
  '6months': 'bg-orange-100 text-orange-700 ring-orange-200',
  '1year':   'bg-violet-100 text-violet-700 ring-violet-200',
  '5years':  'bg-fuchsia-100 text-fuchsia-700 ring-fuchsia-200',
}

const priorityColor = ['', 'bg-red-500', 'bg-orange-400', 'bg-yellow-400', 'bg-blue-400', 'bg-slate-400']

const emptyForm = {
  title: '', description: '', horizon: '1month',
  priority: 3, category: '', targetDate: '', customInstructions: '',
}

function formatRelative(date) {
  if (!date) return null
  const ms = Date.now() - new Date(date).getTime()
  const days = Math.floor(ms / 86400000)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return new Date(date).toLocaleDateString()
}

function InputField({ label, children, className = '' }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</label>
      {children}
    </div>
  )
}

const iCls = 'rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/20 transition'

export default function Goals() {
  const { goals, setGoals, refreshGoals } = useApp()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [proposalsByGoal, setProposalsByGoal] = useState({})
  const [proposingId, setProposingId] = useState(null)
  const [researchingId, setResearchingId] = useState(null)
  const [noteDraft, setNoteDraft] = useState({})
  const [savingNoteId, setSavingNoteId] = useState(null)
  const [expandedGoal, setExpandedGoal] = useState(null)

  const flash = (msg, isError = false) => {
    if (isError) setError(msg)
    else setNotice(msg)
    setTimeout(() => { setError(''); setNotice('') }, 4000)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { flash('Title is required', true); return }
    setSaving(true)
    setError('')
    try {
      await createGoal({
        title: form.title.trim(),
        description: form.description.trim(),
        horizon: form.horizon,
        priority: Number(form.priority),
        category: form.category.trim(),
        targetDate: form.targetDate || undefined,
        agentConfig: form.customInstructions.trim()
          ? { customInstructions: form.customInstructions.trim() }
          : undefined,
      })
      setForm(emptyForm)
      setShowForm(false)
      flash('Milestone added')
      await refreshGoals()
    } catch (err) {
      flash(err.message, true)
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (goal) => {
    const next = goal.status === 'active' ? 'paused' : 'active'
    try {
      await updateGoal(goal._id, { status: next })
      setGoals((prev) => prev.map((g) => (g._id === goal._id ? { ...g, status: next } : g)))
    } catch (err) {
      flash(err.message, true)
    }
  }

  const remove = async (goal) => {
    if (!confirm(`Delete "${goal.title}"? This cannot be undone.`)) return
    try {
      await deleteGoal(goal._id)
      setGoals((prev) => prev.filter((g) => g._id !== goal._id))
      flash('Milestone deleted')
    } catch (err) {
      flash(err.message, true)
    }
  }

  const propose = async (goal) => {
    setProposingId(goal._id)
    setExpandedGoal(goal._id)
    try {
      const data = await proposeForGoal(goal._id)
      setProposalsByGoal((prev) => ({ ...prev, [goal._id]: data.proposal }))
    } catch (err) {
      flash(err.message, true)
    } finally {
      setProposingId(null)
    }
  }

  const startResearch = async (goal) => {
    setResearchingId(goal._id)
    try {
      const data = await apiStartResearch(goal._id)
      navigate(`/research/${data.runId}`)
    } catch (err) {
      flash(err.message, true)
      setResearchingId(null)
    }
  }

  const submitNote = async (goal) => {
    const text = (noteDraft[goal._id] || '').trim()
    if (!text) return
    setSavingNoteId(goal._id)
    try {
      await addGoalNote(goal._id, text)
      setNoteDraft((prev) => ({ ...prev, [goal._id]: '' }))
      flash('Note logged — agent will use this context')
      await refreshGoals()
    } catch (err) {
      flash(err.message, true)
    } finally {
      setSavingNoteId(null)
    }
  }

  const activeGoals = goals.filter((g) => g.status === 'active')
  const pausedGoals = goals.filter((g) => g.status !== 'active')

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Milestones</h1>
            <p className="text-sm text-slate-500">Each goal has its own AI agent proposing daily actions.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span><strong className="text-slate-800">{activeGoals.length}</strong> active</span>
              <span><strong className="text-slate-800">{pausedGoals.length}</strong> paused</span>
            </div>
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-700"
            >
              <span className="text-base leading-none">{showForm ? '×' : '+'}</span>
              {showForm ? 'Cancel' : 'New Milestone'}
            </button>
          </div>
        </div>

        {(error || notice) && (
          <div className={`mt-3 rounded-lg px-4 py-2.5 text-sm font-medium ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {error || notice}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
        {/* Add form */}
        {showForm && (
          <div className="mb-6 rounded-2xl border border-indigo-100 bg-white p-6 shadow-xl shadow-indigo-500/5">
            <h2 className="mb-4 text-base font-bold text-slate-900">New Milestone</h2>
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <InputField label="Title *" className="sm:col-span-2">
                <input
                  className={iCls}
                  placeholder="e.g., Land a software engineering role"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </InputField>

              <InputField label="Description" className="sm:col-span-2">
                <textarea
                  rows={2}
                  className={iCls}
                  placeholder="What does success look like?"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </InputField>

              <InputField label="Category">
                <input
                  className={iCls}
                  placeholder="Career, Health, Learning…"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </InputField>

              <InputField label="Time Horizon">
                <select className={iCls} value={form.horizon} onChange={(e) => setForm({ ...form, horizon: e.target.value })}>
                  {HORIZONS.map((h) => <option key={h} value={h}>{HORIZON_LABELS[h]}</option>)}
                </select>
              </InputField>

              <InputField label="Priority (1 = highest)">
                <select className={iCls} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {[1, 2, 3, 4, 5].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </InputField>

              <InputField label="Target Date">
                <input type="date" className={iCls} value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
              </InputField>

              <InputField label="Agent Instructions" className="sm:col-span-2">
                  <textarea
                    rows={2}
                    className={iCls}
                    placeholder="Custom hints for the AI agent (e.g., 'Focus on senior roles at startups')"
                    value={form.customInstructions}
                    onChange={(e) => setForm({ ...form, customInstructions: e.target.value })}
                  />
              </InputField>

              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-700 disabled:opacity-60"
                >
                  {saving ? 'Creating…' : 'Create Milestone'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Active goals */}
        {activeGoals.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50">
              <svg className="h-7 w-7 text-indigo-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="4" />
              </svg>
            </div>
            <p className="mt-4 text-base font-semibold text-slate-700">No milestones yet</p>
            <p className="mt-1 text-sm text-slate-400">Each milestone gets its own AI Goal Agent.</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-700"
            >
              + Add first milestone
            </button>
          </div>
        )}

        {activeGoals.length > 0 && (
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">Active</p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {activeGoals.map((g) => <GoalCard key={g._id} goal={g} {...{ proposalsByGoal, proposingId, researchingId, noteDraft, setNoteDraft, savingNoteId, expandedGoal, setExpandedGoal, propose, startResearch, submitNote, toggleStatus, remove }} />)}
            </div>
          </div>
        )}

        {pausedGoals.length > 0 && (
          <div className="mt-8">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">Paused</p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {pausedGoals.map((g) => <GoalCard key={g._id} goal={g} {...{ proposalsByGoal, proposingId, researchingId, noteDraft, setNoteDraft, savingNoteId, expandedGoal, setExpandedGoal, propose, startResearch, submitNote, toggleStatus, remove }} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function GoalCard({ goal: g, proposalsByGoal, proposingId, researchingId, noteDraft, setNoteDraft, savingNoteId, expandedGoal, setExpandedGoal, propose, startResearch, submitNote, toggleStatus, remove }) {
  const proposal = proposalsByGoal[g._id]
  const completedCount = g.progress?.completedCount || 0
  const lastActivity = formatRelative(g.progress?.lastActivityAt)
  const recentCompletions = g.recentCompletions || []
  const recentNotes = (g.progress?.notes || []).slice(-3).reverse()
  const expanded = expandedGoal === g._id
  const pct = Math.min(100, Math.round((completedCount / 20) * 100))

  return (
    <div className={`flex flex-col rounded-2xl bg-white shadow-sm ring-1 transition-all ${g.status === 'active' ? 'ring-slate-200' : 'ring-slate-100 opacity-70'}`}>
      {/* Card header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${horizonColor[g.horizon] || 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
                {HORIZON_LABELS[g.horizon] || g.horizon}
              </span>
              <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                <span className={`h-1.5 w-1.5 rounded-full ${priorityColor[g.priority] || 'bg-slate-400'}`} />
                P{g.priority}
              </span>
              {g.category && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{g.category}</span>
              )}
            </div>
            <h3 className="text-sm font-bold leading-snug text-slate-900">{g.title}</h3>
            {g.description && (
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500 line-clamp-2">{g.description}</p>
            )}
          </div>
          <button
            onClick={() => remove(g)}
            className="shrink-0 flex h-6 w-6 items-center justify-center rounded-md text-slate-300 transition hover:bg-red-50 hover:text-red-500"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-slate-400">Progress</span>
            <span className="text-[10px] font-semibold text-slate-600">{completedCount} completed</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100">
            <div
              className="h-1.5 rounded-full bg-indigo-500 transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          {lastActivity && (
            <p className="mt-1 text-[10px] text-slate-400">Last activity: {lastActivity}</p>
          )}
        </div>

        {g.targetDate && (
          <p className="mt-2 text-[10px] text-slate-400">
            Target: {new Date(g.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 border-t border-slate-100 px-4 py-3">
        <button
          onClick={() => propose(g)}
          disabled={proposingId === g._id || researchingId === g._id}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
        >
          {proposingId === g._id ? (
            <>
              <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Thinking…
            </>
          ) : '🤖 AI Suggest'}
        </button>
        <button
          onClick={() => startResearch(g)}
          disabled={researchingId === g._id || proposingId === g._id}
          title="Deep research with web search, Docs, Gmail, and browser tools"
          className="flex items-center justify-center gap-1 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-100 disabled:opacity-60"
        >
          {researchingId === g._id ? (
            <>
              <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Starting…
            </>
          ) : (
            <>
              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              Research
            </>
          )}
        </button>
        <button
          onClick={() => toggleStatus(g)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          {g.status === 'active' ? 'Pause' : 'Activate'}
        </button>
        <button
          onClick={() => setExpandedGoal(expanded ? null : g._id)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
          {/* Note input */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Log a note for the agent…"
              value={noteDraft[g._id] || ''}
              onChange={(e) => setNoteDraft((prev) => ({ ...prev, [g._id]: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && submitNote(g)}
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-800 placeholder:text-slate-400 focus:border-amber-400 focus:bg-white focus:outline-none"
            />
            <button
              onClick={() => submitNote(g)}
              disabled={savingNoteId === g._id || !(noteDraft[g._id] || '').trim()}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
            >
              {savingNoteId === g._id ? '…' : '+ Log'}
            </button>
          </div>

          {recentCompletions.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 mb-1">Recent completions</p>
              {recentCompletions.map((c, i) => (
                <div key={i} className="flex items-center justify-between py-0.5">
                  <p className="text-[11px] text-slate-700 truncate">✓ {c.title}</p>
                  <p className="text-[10px] text-slate-400 ml-2 shrink-0">{formatRelative(c.completedAt)}</p>
                </div>
              ))}
            </div>
          )}

          {recentNotes.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 mb-1">Notes</p>
              {recentNotes.map((n, i) => (
                <p key={i} className="text-[11px] text-slate-600 py-0.5">
                  <span className="text-slate-400">{formatRelative(n.at)}: </span>{n.text}
                </p>
              ))}
            </div>
          )}

          {proposal && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-1.5">Agent Proposals</p>
              {proposal.progressReport && (
                <p className="text-[11px] text-indigo-700 mb-2">{proposal.progressReport}</p>
              )}
              <div className="space-y-1.5">
                {(proposal.candidates || []).map((c, i) => (
                  <div key={i} className="rounded-lg border border-indigo-100 bg-white px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-800">{c.title}</span>
                      <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">{c.urgency}</span>
                      <span className="text-[10px] text-slate-400">{c.estimatedMinutes}min</span>
                    </div>
                    {c.rationale && <p className="mt-0.5 text-[10px] text-slate-500">{c.rationale}</p>}
                  </div>
                ))}
              </div>
              {proposal.questionForUser && (
                <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] italic text-amber-700">
                  💬 {proposal.questionForUser}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
