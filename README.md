# Todo10kr — Multi-Agent Productivity OS

Set life-goal milestones. Each milestone gets its own **AI Goal Agent** that proposes daily actions, and a deep **Research Agent** that autonomously searches Google Docs, Gmail, the web, and real browser sessions to surface evidence-backed next steps. An **Orchestrator Agent** merges all proposals with your dump todos and Google Calendar into a balanced daily schedule. As you complete tasks, the agents learn what you actually did and adapt.

---

## What's in this version

- **Phase 1** — Milestones (Goals) as first-class data in MongoDB, dedicated page + sidebar nav
- **Phase 2** — One **Goal Agent** per active milestone (single LLM call), per-goal "Get suggestions" button
- **Phase 3** — **Orchestrator Agent** that pulls all goal agent proposals + dump todos + free slots + recent activity load, then builds the day
- **Phase 4** — Progress / memory loop: completed schedule slots write back to `Goal.progress`; Goal Agent ingests recent completions + notes so it stops repeating itself
- **Phase 5** — **Research Agent** (LangGraph.js ReAct loop): per-milestone deep research with 5 real tools, live trace streaming over SSE, approve/decline proposals UI

---

## Agent system

### 1. Goal Agent — fast one-shot suggestions

Click **🤖 AI Suggest** on any milestone. Runs a single OpenAI call that reads your recent completions and notes, then proposes 1–3 concrete daily actions (urgency, energy cost, time estimate, rationale).

### 2. Research Agent — deep agentic research

Click **🔍 Research** on any milestone. Opens a live trace page and runs an iterative LangGraph ReAct loop:

```
Milestone context
      │
      ▼
   Planner LLM  (gpt-4o-mini, tool-calling)
      │
      ├─► googleDocs   — search + read your Google Drive documents
      ├─► emailRead    — search your Gmail inbox for relevant threads
      ├─► webSearch    — Tavily API for current web results
      ├─► browserUse  — real browser automation: screenshots, brand analysis, page extraction
      └─► emailWrite  — draft or send emails (Gmail drafts by default)
      │
      ▼
   Summarizer LLM  (extracts proposals from the full research conversation)
      │
      ▼
   Proposals panel — Approve → creates linked Todos | Decline → discard
```

Every tool call, tool result, and reasoning step streams live to the trace page. The agent won't finish until it has called all four required tools (Google Docs, Gmail, web search, browser).

### 3. Orchestrator Agent — builds the day

```
GoalAgent(Goal A) ─┐
GoalAgent(Goal B) ─┼─► OrchestratorAgent ─► daily schedule + deferred list
GoalAgent(Goal C) ─┘
                           │
                           ▼
             schedule items persisted as Todos
                           │
                           ▼
       user marks done → Goal.progress updates
                           │
                           ▼
     next agent run sees recent completions + notes
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js (ESM), Express |
| Agents | LangGraph.js, LangChain.js, OpenAI `gpt-4o-mini` |
| Database | MongoDB + Mongoose |
| Google | Calendar API, Gmail API, Drive API, Docs API — single OAuth client |
| Web search | Tavily API |
| Browser | browser-use API (bring your own endpoint) |
| Frontend | React 18, Vite, Tailwind CSS v4, React Router v6 |
| Streaming | Native SSE (`EventSource`) |

---

## Folder structure

```
backend/
  src/
    config/
      env.js               env loading + assertOpenAI() / assertResearch()
      db.js                MongoDB connection
      googleScopes.js      canonical Google OAuth scope list (Calendar + Gmail + Docs + Drive)
    models/
      Goal.js              Mongoose Goal model (with progress sub-doc)
      Todo.js              Mongoose Todo model (linked to Goal optionally)
      ResearchRun.js       Mongoose model: run status, full event trace, proposals[]
    agents/
      base/AgentBase.js                shared OpenAI client + JSON-mode runner
      goal/
        GoalAgent.js                   one specialist agent per goal (single LLM call)
        prompts.js
      orchestrator/
        OrchestratorAgent.js           pulls proposals + builds schedule
        persistSchedule.js             materializes schedule slots as Todos
        prompts.js
      research/
        ResearchAgent.js               LangGraph ReAct graph (planner → tools → summarizer)
        prompts.js
        tools/
          googleDocs.tool.js           Drive search + Docs text extraction
          emailRead.tool.js            Gmail inbox search
          emailWrite.tool.js           Gmail draft / send
          webSearch.tool.js            Tavily REST API
          browserUse.tool.js           browser-use API (screenshots, page text)
    services/
      gcal.service.js                  OAuth + Calendar event read/write (shared OAuth client)
      progress.service.js              goal-progress writes + queries
    data/
      seed.js                          seeds dummy todos on first boot
      tokenStore.js                    persists OAuth tokens to .tokens.json
    routes/
      goals.routes.js                  CRUD + /:id/propose + /:id/notes
      todos.routes.js                  CRUD; PATCH triggers goal progress update
      schedule.routes.js               POST /generate (orchestrator + persist)
      auth.routes.js                   Google OAuth
      gcal.routes.js                   today's events, push-schedule
      research.routes.js               start run, SSE stream, approve, decline
    utils/
      time.js, freeSlots.js, scheduleTime.js
    server.js                          entry: connect DB, seed, mount routes
  .env.research.example                full API config reference + setup instructions

frontend/
  src/
    api/
      client.js, goals.js, todos.js, schedule.js, gcal.js, research.js
    components/
      AppLayout.jsx, Sidebar.jsx, MobileNav.jsx
    pages/
      Dashboard.jsx                    todo lists + quick schedule
      Goals.jsx                        milestones + AI Suggest + Research button
      Calendar.jsx                     day timeline + GCal + generate + push
      Research.jsx                     live trace timeline + proposals panel
    App.jsx                            router (Research page is full-screen, outside AppLayout)
    context/AppContext.jsx             global state + sessionStorage persistence
```

---

## Setup

### Prerequisites

- Node.js v18+
- MongoDB (local or Atlas)
- OpenAI API key (`gpt-4o-mini` recommended)
- Tavily API key (for web search in Research Agent)
- browser-use API endpoint + key (for browser automation)
- Google Cloud OAuth client (for Calendar, Gmail, Drive, Docs)

### 1. Clone and install

```bash
# backend
cd backend
npm install

# frontend
cd ../frontend
npm install
```

### 2. Configure `backend/.env`

Copy the example and fill in your keys:

```env
PORT=5001
FRONTEND_URL=http://localhost:5173

# MongoDB
MONGO_URI=mongodb://127.0.0.1:27017/todo10kr

# OpenAI — use gpt-4o-mini for tool-calling reliability
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Google OAuth — same client covers Calendar, Gmail, Drive, Docs
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REDIRECT_URI=http://localhost:5001/api/auth/google/callback
GOOGLE_CALENDAR_ID=primary
GOOGLE_REFRESH_TOKEN=           # populated after first connect

# Working day window
DAY_START_HOUR=8
DAY_END_HOUR=22

# Research Agent tools
TAVILY_API_KEY=tvly-...
BROWSER_USE_API_URL=https://your-browser-use-host/api
BROWSER_USE_API_KEY=...
EMAIL_WRITER_MODE=draft          # draft | send

# Optional: LangSmith tracing
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_...
LANGSMITH_PROJECT=todo10kr-research
```

See `backend/.env.research.example` for full setup instructions including how to get each key and how to enable the Gmail / Drive / Docs scopes in Google Cloud Console.

### 3. Google OAuth scopes (required for Research Agent)

The Research Agent uses Gmail, Drive, and Docs on top of the existing Calendar scope. In [Google Cloud Console](https://console.cloud.google.com):

1. **APIs & Services → Library** — enable: Gmail API, Google Docs API, Google Drive API
2. **OAuth consent screen → Scopes** — add:
   - `gmail.readonly`, `gmail.send`, `documents.readonly`, `drive.readonly`
3. In the app: **Disconnect → Connect Google Calendar** to mint a new token covering all scopes

### 4. Run

```bash
# terminal 1 — backend
cd backend
npm run dev

# terminal 2 — frontend
cd frontend
npm run dev
```

Open <http://localhost:5173>

---

## Using the app

### Add milestones (Milestones page)

Click **🎯 Milestones** in the sidebar. Examples:

| Title | Horizon | Priority |
|-------|---------|----------|
| Land a senior backend role at a NYC startup | 1 month | 1 |
| Launch newsletter and reach 1k subscribers | 3 months | 2 |
| Get conversational in Spanish before October trip | 6 months | 3 |

Each milestone can include **custom agent instructions** injected into its system prompt.

### AI Suggest (fast)

Click **🤖 AI Suggest** on any goal card. Returns 1–3 candidate todos in ~2 seconds based on your recent completions and notes. No external tools.

### Research (deep)

Click **🔍 Research** on any goal card. Navigates to `/research/:runId`. The Research Agent:

1. Searches your **Google Docs** for internal context (resume, notes, vocab notebook, drafts)
2. Searches your **Gmail** for relevant threads (recruiter emails, tutor recaps, subscriber feedback)
3. **Web searches** for current opportunities, trends, resources
4. Opens a **real browser** to analyze promising URLs (job pages, competitor sites, pricing pages) and takes screenshots
5. Optionally **drafts emails** (outreach, booking requests, follow-ups) saved to Gmail drafts
6. Produces **3–5 evidence-backed proposals** citing the real source (doc title, email subject, URL) for each

Every step streams live to the trace panel. Approve all or select individual proposals to create linked Todos. Decline to discard.

### Schedule the day (Calendar page)

1. Connect Google Calendar → **Pull** today's events, or add events manually
2. Toggle **Use live GCal events when scheduling**
3. Click **Schedule day** — the Orchestrator calls all active Goal Agents in parallel, merges proposals + dump todos, fills only free slots, and returns a colour-coded timeline
4. Mark slots **✓ Done** — completion writes back to `Goal.progress`
5. Click **Push to calendar** to insert AI-placed slots into Google Calendar

---

## API reference

### Goals

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/goals` | list all goals + recent completions per goal |
| POST | `/api/goals` | create goal |
| PATCH | `/api/goals/:id` | update goal |
| DELETE | `/api/goals/:id` | delete |
| POST | `/api/goals/:id/propose` | run Goal Agent (single LLM call) |
| POST | `/api/goals/:id/notes` | append progress note |

### Todos

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/todos` | dump + suggested todos |
| POST | `/api/todos` | create todo |
| PATCH | `/api/todos/:id` | update / complete (auto-updates linked `Goal.progress`) |
| DELETE | `/api/todos/:id` | delete |

### Schedule

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/schedule/generate` | orchestrator builds day + persists actionable slots |

### Google Auth

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/auth/google/status` | `{ connected }` |
| GET | `/api/auth/google` | start OAuth |
| GET | `/api/auth/google/callback` | OAuth callback |
| POST | `/api/auth/google/disconnect` | clear tokens |

### Google Calendar

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/gcal/events/today?date=YYYY-MM-DD` | fetch events |
| POST | `/api/gcal/events/push-schedule` | push AI slots to GCal |

### Research Agent

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/research/start` | start run; returns `{ runId }` |
| GET | `/api/research/runs/:runId/stream` | SSE stream of live agent trace events |
| GET | `/api/research/runs/:runId` | full run snapshot (page hydration) |
| POST | `/api/research/runs/:runId/approve` | create Todos for selected proposals; body: `{ selected?: number[] }` |
| POST | `/api/research/runs/:runId/decline` | mark run declined |

#### SSE event types

| Event | Data | Meaning |
|-------|------|---------|
| `thought` | `{ text }` | agent reasoning text |
| `tool_call` | `{ tool, args }` | tool invocation starting |
| `tool_result` | `{ tool, output }` | tool returned (screenshots inside `output.screenshots` for browserUse) |
| `proposals` | `{ proposals[], summary }` | final proposals ready |
| `done` | `{ status }` | run finished (`awaiting_approval` or `error`) |
| `needs_reconnect` | `{ message }` | Google token invalid — user must reconnect |
| `error` | `{ message }` | non-recoverable agent error |

---

## Three research use cases (exercise all five tools)

### "Land a senior backend role at a NYC startup"
- `googleDocs` → finds Resume.gdoc + Career-notes.gdoc
- `emailRead` → finds past recruiter thread
- `webSearch` → NYC startup backend jobs 2026
- `browserUse` → screenshots Stripe, Linear, Vercel careers pages
- `emailWrite` → drafts cold outreach emails
- **Proposals:** tailor resume bullet, send drafts to recruiters, apply to top 3

### "Launch newsletter and reach 1k subscribers"
- `googleDocs` → finds existing draft posts in Drive
- `emailRead` → finds subscriber feedback emails
- `webSearch` → trending topics in your niche this week
- `browserUse` → screenshots competitor Substack pricing/about pages
- `emailWrite` → drafts welcome email + this week's issue
- **Proposals:** publish Thursday, set up referral program, reply to first 10 subs

### "Get conversational in Spanish before October trip"
- `googleDocs` → reads vocab notebook in Drive
- `emailRead` → finds past tutor recap emails
- `webSearch` → best Spanish podcasts for B1 learners
- `browserUse` → compares italki vs Pimsleur vs Babbel pricing with screenshots
- `emailWrite` → drafts trial-lesson requests to tutors
- **Proposals:** daily Anki review, book trial with tutor, listen to podcast on commute

---

## License

ISC
"# todobas" 
"# todobasss" 
