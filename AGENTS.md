# AGENTS.md — DayOS / Todo10kr Project Documentation

Complete technical reference for the agentic productivity app. Read this before modifying any file.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Layout](#2-repository-layout)
3. [Running the App](#3-running-the-app)
4. [Environment Variables](#4-environment-variables)
5. [Backend Architecture](#5-backend-architecture)
   - 5.1 [Entry Point — server.js](#51-entry-point--serverjs)
   - 5.2 [Config Layer](#52-config-layer)
   - 5.3 [Database](#53-database)
   - 5.4 [Models](#54-models)
   - 5.5 [Routes](#55-routes)
   - 5.6 [Services](#56-services)
   - 5.7 [Utilities](#57-utilities)
   - 5.8 [Data](#58-data)
6. [Agent System](#6-agent-system)
   - 6.1 [AgentBase](#61-agentbase)
   - 6.2 [GoalAgent](#62-goalagent)
   - 6.3 [OrchestratorAgent](#63-orchestratoragent)
   - 6.4 [persistSchedule](#64-persistschedule)
   - 6.5 [Full Orchestration Flow](#65-full-orchestration-flow)
7. [Google Calendar Integration](#7-google-calendar-integration)
8. [Frontend Architecture](#8-frontend-architecture)
   - 8.1 [App Shell](#81-app-shell)
   - 8.2 [Global State — AppContext](#82-global-state--appcontext)
   - 8.3 [Pages](#83-pages)
   - 8.4 [API Clients](#84-api-clients)
9. [Data Flow — End to End](#9-data-flow--end-to-end)
10. [Key Design Decisions](#10-key-design-decisions)
11. [API Reference](#11-api-reference)
12. [Common Gotchas](#12-common-gotchas)

---

## 1. Project Overview

**DayOS** (branded as Todo10kr) is a full-stack agentic productivity app. It combines a classical todo list with a multi-agent AI system that:

- Lets users define long-term **Milestones** (goals) with time horizons and priorities.
- Spawns a dedicated **Goal Agent** (OpenAI LLM call) per active milestone that proposes small, concrete daily actions based on recent progress.
- Uses an **Orchestrator Agent** that aggregates all goal-agent proposals, the user's dump todos, and their Google Calendar events, then synthesises a balanced day schedule that only fills genuinely empty time slots.
- Supports a **Calendar page** with a day-view timeline (08:00–22:00), day navigation, and a GCal push action.
- Maintains a **progress/memory loop**: completing a task on the schedule updates the linked goal's `completedCount` and `lastActivityAt`, which informs future agent suggestions.

**Tech stack:**
- Backend: Node.js (ESM), Express, Mongoose, OpenAI SDK v4, Google APIs
- Frontend: React (Vite), Tailwind CSS v4, React Router DOM
- Database: MongoDB Atlas (or local)

---

## 2. Repository Layout

```
10krcoassesment/
├── backend/
│   ├── .env                          # Secret keys (never commit)
│   ├── package.json
│   └── src/
│       ├── server.js                 # Express entry point
│       ├── config/
│       │   ├── env.js                # Config object + assertion helpers
│       │   └── db.js                 # Mongoose connection
│       ├── models/
│       │   ├── Goal.js               # Mongoose Goal schema
│       │   └── Todo.js               # Mongoose Todo schema
│       ├── routes/
│       │   ├── auth.routes.js        # Google OAuth endpoints
│       │   ├── gcal.routes.js        # GCal fetch + push endpoints
│       │   ├── goals.routes.js       # Goals CRUD + agent trigger
│       │   ├── schedule.routes.js    # AI schedule generation
│       │   └── todos.routes.js       # Todos CRUD
│       ├── services/
│       │   ├── gcal.service.js       # Google Calendar SDK wrapper
│       │   └── progress.service.js   # Goal progress updates + queries
│       ├── agents/
│       │   ├── base/
│       │   │   └── AgentBase.js      # Abstract LLM agent base class
│       │   ├── goal/
│       │   │   ├── GoalAgent.js      # Per-milestone specialist agent
│       │   │   └── prompts.js        # GoalAgent system + user prompts
│       │   └── orchestrator/
│       │       ├── OrchestratorAgent.js  # Day-scheduling agent
│       │       ├── prompts.js            # Orchestrator prompts
│       │       └── persistSchedule.js    # Link schedule slots → Todos
│       ├── utils/
│       │   ├── freeSlots.js          # Find gaps in the calendar
│       │   ├── scheduleTime.js       # Parse "8:00 AM - 9:00 AM" → ISO
│       │   └── time.js               # parseTimeString, formatMinutes
│       └── data/
│           ├── seed.js               # Seed initial todos on first run
│           └── tokenStore.js         # Persist Google OAuth tokens to disk
│
├── frontend/
│   ├── vite.config.js
│   ├── package.json
│   └── src/
│       ├── main.jsx                  # React entry point
│       ├── App.jsx                   # BrowserRouter + AppProvider + Routes
│       ├── index.css                 # @import "tailwindcss"
│       ├── context/
│       │   └── AppContext.jsx        # Global state (per-date events/schedule, todos, goals)
│       ├── components/
│       │   ├── AppLayout.jsx         # h-screen flex wrapper; renders Sidebar + Outlet
│       │   ├── Sidebar.jsx           # Left nav (Today / Milestones / Calendar)
│       │   └── MobileNav.jsx         # Mobile top nav tabs
│       ├── pages/
│       │   ├── Dashboard.jsx         # /  — Today page (task lists + Open Calendar button)
│       │   ├── Goals.jsx             # /goals — Milestones management
│       │   └── Calendar.jsx          # /calendar — Day timeline + agent controls
│       └── api/
│           ├── client.js             # Base apiFetch wrapper
│           ├── todos.js              # Todos API calls
│           ├── goals.js              # Goals API calls
│           ├── schedule.js           # Schedule generation API call
│           └── gcal.js              # GCal connect/sync/push API calls
│
├── AGENTS.md                         # ← this file
├── README.md
└── projectspecs.md
```

---

## 3. Running the App

### Prerequisites
- Node.js ≥ 18
- MongoDB (Atlas URI or local: `mongodb://127.0.0.1:27017/todo10kr`)
- OpenAI API key
- (Optional) Google Cloud project with Calendar API enabled

### Backend

```powershell
cd backend
npm install
# Fill in backend/.env (see section 4)
npm run dev        # nodemon, port 5001
```

### Frontend

```powershell
cd frontend
npm install
npm run dev        # Vite, port 5173
```

Open `http://localhost:5173`.

---

## 4. Environment Variables

All vars live in `backend/.env`. The frontend reads only `VITE_API_BASE` (optional).

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORT` | No | `5001` | Backend port |
| `MONGO_URI` | Yes | `mongodb://127.0.0.1:27017/todo10kr` | MongoDB connection string |
| `OPENAI_API_KEY` | Yes | — | Powers both agents |
| `OPENAI_MODEL` | No | `gpt-3.5-turbo` | Change to `gpt-4o` for better results |
| `GOOGLE_CLIENT_ID` | For GCal | — | OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | For GCal | — | OAuth 2.0 client secret |
| `GOOGLE_REDIRECT_URI` | For GCal | `http://localhost:5001/api/auth/google/callback` | Must match Google Console exactly |
| `GOOGLE_REFRESH_TOKEN` | Optional | — | Persists session across restarts |
| `GOOGLE_CALENDAR_ID` | No | `primary` | Target calendar for push |
| `FRONTEND_URL` | No | `http://localhost:5173` | OAuth callback redirect |
| `DAY_START_HOUR` | No | `8` | Timeline starts at this hour |
| `DAY_END_HOUR` | No | `22` | Timeline ends at this hour |
| `VITE_API_BASE` | No | `http://localhost:5001` | Frontend API base (set in `frontend/.env`) |

---

## 5. Backend Architecture

### 5.1 Entry Point — server.js

`backend/src/server.js` boots in sequence:

1. Creates Express app; attaches `cors()` and `express.json()`.
2. Mounts all routers under `/api/*`.
3. Calls `connectDB()` (Mongoose).
4. Calls `seedIfEmpty()` — inserts 5 dump + 5 suggested todos only if the `todos` collection is empty.
5. Starts `app.listen()`.

### 5.2 Config Layer

`backend/src/config/env.js` exports a single `config` object parsed from `process.env`. Two assertion helpers are used before IO-bound operations:

- `assertOpenAI()` — throws if `OPENAI_API_KEY` is missing.
- `assertGoogleOAuth()` — throws if `clientId`, `clientSecret`, or `redirectUri` are missing.

### 5.3 Database

`backend/src/config/db.js` — singleton Mongoose connection. Uses `serverSelectionTimeoutMS: 5000`. Provides `connectDB()` and `isDbReady()`.

`backend/src/data/tokenStore.js` — persists Google OAuth tokens to a local `.tokens.json` file next to the server. Provides `getStoredTokens()`, `saveTokens(tokens)`, `clearTokens()`.

### 5.4 Models

#### `Goal` (`backend/src/models/Goal.js`)

| Field | Type | Notes |
|---|---|---|
| `title` | String | Required |
| `description` | String | |
| `horizon` | String enum | `1week | 1month | 3months | 6months | 1year | 5years` |
| `priority` | Number 1–5 | 1 = highest |
| `category` | String | |
| `startDate` | Date | Defaults to creation date |
| `targetDate` | Date | Optional deadline |
| `status` | String enum | `active | paused | done | archived` |
| `progress.lastActivityAt` | Date | Updated when a linked todo is completed |
| `progress.completedCount` | Number | Incremented/decremented on todo completion toggle |
| `progress.notes[]` | `{at, text}` | User-logged notes surfaced to the Goal Agent |
| `agentConfig.enabled` | Boolean | Whether the Goal Agent runs for this goal |
| `agentConfig.browseEnabled` | Boolean | Future: browser-tool access |
| `agentConfig.customInstructions` | String | Injected into the Goal Agent system prompt |

**Virtual:** `daysSinceLastActivity` — computed from `progress.lastActivityAt` to `Date.now()`. Exposed in toJSON/toObject.

#### `Todo` (`backend/src/models/Todo.js`)

| Field | Type | Notes |
|---|---|---|
| `title` | String | Required |
| `description` | String | |
| `type` | String enum | `dump | suggested` |
| `category` | String | |
| `goalId` | ObjectId ref Goal | Links suggested todos to a goal |
| `source` | String enum | `manual | agent | seed` |
| `priority` | Number 1–5 | |
| `estimatedMinutes` | Number | Default 30 |
| `energyCost` | String enum | `low | medium | high` |
| `completed` | Boolean | |
| `completedAt` | Date | Set when `completed` flips to true |

Indexes: `{ type, completed }`, `{ goalId }`.

### 5.5 Routes

#### `GET /api/health`
No-auth liveness probe. Returns `{ ok: true, timestamp }`.

#### Todos — `todos.routes.js`

| Method | Path | Description |
|---|---|---|
| GET | `/api/todos` | Returns `{ dumpTodos[], suggestedTodos[] }` sorted by `createdAt desc` |
| POST | `/api/todos` | Create a todo. Body: `{ title, type, category, goalId, priority, estimatedMinutes }` |
| PATCH | `/api/todos/:id` | Update fields: `title, completed, priority, category, estimatedMinutes`. When `completed` changes and `goalId` is set, calls `applyTodoCompletionToGoal`. |
| DELETE | `/api/todos/:id` | Hard delete |

#### Goals — `goals.routes.js`

| Method | Path | Description |
|---|---|---|
| GET | `/api/goals` | Returns all goals sorted by priority, with `recentCompletions[]` injected per goal |
| POST | `/api/goals` | Create goal. Required: `title`, `horizon`. |
| GET | `/api/goals/:id` | Single goal |
| PATCH | `/api/goals/:id` | Update allowed fields: `title, description, horizon, priority, category, status, targetDate, agentConfig` |
| DELETE | `/api/goals/:id` | Hard delete |
| POST | `/api/goals/:id/notes` | Append a progress note. Body: `{ text }` |
| POST | `/api/goals/:id/propose` | Run the Goal Agent for this goal, returns `{ proposal }` |

#### Auth — `auth.routes.js`

| Method | Path | Description |
|---|---|---|
| GET | `/api/auth/google/status` | Returns `{ connected: bool }` |
| GET | `/api/auth/google` | Redirects to Google OAuth consent screen |
| GET | `/api/auth/google/callback` | Exchanges code for tokens, saves to tokenStore, redirects to frontend with `?gcal=connected` |
| POST | `/api/auth/google/disconnect` | Clears stored tokens |

#### GCal — `gcal.routes.js`

| Method | Path | Description |
|---|---|---|
| GET | `/api/gcal/events/today` | Fetch events for today (or `?date=YYYY-MM-DD`). Requires auth. |
| POST | `/api/gcal/events/push-schedule` | Push AI-placed slots to Google Calendar. Body: `{ schedule[], date? }`. Sets `needsReconnect` in response when scope error. |

#### Schedule — `schedule.routes.js`

| Method | Path | Description |
|---|---|---|
| POST | `/api/schedule/generate` | Full agentic scheduling. Body: `{ calendarEvents[], useGCal?, date? }`. Returns enriched schedule with `todoId` on each slot. |

**Key detail for today's schedule:** when `date === todayKey()`, the route computes `minStartMinutes = currentHour*60 + currentMinute + 5` and passes it to `findFreeSlots`. This ensures already-elapsed time is never offered to the AI — it only fills upcoming slots.

### 5.6 Services

#### `gcal.service.js`

Core functions:

| Function | Signature | Description |
|---|---|---|
| `getAuthUrl()` | `() → string` | Generates Google OAuth URL with `calendar.events` scope |
| `exchangeCodeForTokens(code)` | `(string) → tokens` | Exchanges auth code, saves tokens |
| `isAuthenticated()` | `() → bool` | Checks if a token is available |
| `fetchEventsForDate(dateStr?)` | `(YYYY-MM-DD?) → events[]` | Fetches GCal events for any date (null = today) |
| `fetchTodaysEvents()` | `() → events[]` | Alias for `fetchEventsForDate(null)` |
| `insertScheduleIntoCalendar(slots, dateStr?)` | `(slots[], YYYY-MM-DD?) → {inserted, failed, results}` | Pushes AI-placed slots to GCal with correct date |

Event shape returned: `{ id, title, startTime, endTime, startISO, endISO, location, source: "gcal" }`.

#### `progress.service.js`

| Function | Description |
|---|---|
| `applyTodoCompletionToGoal({ goalId, wasCompleted, isCompleted })` | Idempotent: increments/decrements `progress.completedCount`, sets `progress.lastActivityAt` |
| `appendGoalNote(goalId, text)` | Pushes `{ text, at }` to `progress.notes[]` |
| `fetchRecentCompletions(goalId, limit=5)` | Returns recent completed todos for a single goal |
| `fetchRecentCompletionsForGoals(goalIds, perGoalLimit=5)` | Returns a `Map<goalId → completions[]>` — used on the goals list endpoint |

### 5.7 Utilities

#### `freeSlots.js`

```js
findFreeSlots(calendarEvents, { dayStartHour, dayEndHour, minStartMinutes })
```

- Parses event `startTime`/`endTime` strings → minutes-of-day.
- Sorts events, walks them to find gaps.
- `minStartMinutes`: when set (today-only), clips the lower bound so past time is ignored.
- Returns `Array<{ start, end, duration }>`.

```js
formatFreeSlots(freeSlots) → string
```

Human-readable slot list for debugging.

#### `scheduleTime.js`

```js
parseTimeRangeToTodayISO(timeRange, dateStr?)
```

- Parses `"8:00 AM - 9:30 AM"` into `{ startISO, endISO, startMinutes, endMinutes }`.
- `dateStr` (YYYY-MM-DD) controls which date the ISO uses — defaults to today.
- Used by `insertScheduleIntoCalendar` to write events on the correct calendar day.

#### `time.js`

- `parseTimeString(str)` → minutes of day. Handles `"9:00 AM"`, `"09:00"` formats.
- `formatMinutes(min)` → `"9:00 AM"` string.

### 5.8 Data

#### `seed.js`

- `seedIfEmpty()` — checks `Todo.countDocuments()`. If zero, inserts 5 dump todos + 5 suggested todos with `source: "seed"`. Runs at startup.

---

## 6. Agent System

The agent system follows a **hub-and-spoke** topology:

```
Active Goals
   │
   ├── GoalAgent (Goal A)  ──┐
   ├── GoalAgent (Goal B)  ──┤ proposals[]
   └── GoalAgent (Goal C)  ──┘
                              ↓
                    OrchestratorAgent
                              │
                     enriched schedule
                              ↓
                    persistAndEnrichSchedule
                              │
                    response to frontend
```

### 6.1 AgentBase

`backend/src/agents/base/AgentBase.js`

Abstract base class for all agents. Subclasses implement `systemPrompt()` and `userPrompt(context)`.

```js
class AgentBase {
  constructor({ name, model, temperature, maxTokens })
  systemPrompt()         // abstract — return system message string
  userPrompt(context)    // abstract — return user message string
  async run(context)     // calls OpenAI, parses JSON, returns object
}
```

`run(context)` always uses `response_format: { type: "json_object" }` — the model is forced to return valid JSON. If `JSON.parse` fails, throws with the raw output attached.

Singleton OpenAI client via `getOpenAIClient()` — instantiated once and reused across all agent calls in a request.

### 6.2 GoalAgent

`backend/src/agents/goal/GoalAgent.js`

One agent per active milestone. Runs in parallel (via `Promise.all`) during orchestration.

**Input context built by `buildContext(goal)`:**
- `recentCompletions` — last 5 completed todos linked to this goal (from `progress.service`).
- `recentNotes` — last 3 user-logged notes from `goal.progress.notes`.
- `today` — current Date.

**System prompt** (`GOAL_AGENT_SYSTEM`): instructs the agent to propose 1–3 small concrete tasks, avoid repeating recent completions, respect the goal's horizon and priority, and not dominate the schedule.

**User prompt** (`goalAgentUserPrompt`): injects:
- Goal title, description, category, horizon, priority, target date.
- `daysSinceLastActivity` virtual.
- Formatted recent completions and notes.
- Custom instructions from `agentConfig.customInstructions`.

**Output JSON shape:**
```json
{
  "goalId": "...",
  "candidates": [
    {
      "title": "...",
      "description": "...",
      "estimatedMinutes": 30,
      "energyCost": "medium",
      "urgency": "high",
      "rationale": "..."
    }
  ],
  "progressReport": "...",
  "questionForUser": "..."
}
```

**Export:**
- `runGoalAgent(goal, baseContext)` — public entry point used by both `orchestrateDay` and the `POST /api/goals/:id/propose` route.

### 6.3 OrchestratorAgent

`backend/src/agents/orchestrator/OrchestratorAgent.js`

**`orchestrateDay({ calendarEvents, freeSlots, extraDumpTodos? })`** is the main entry point. Steps:

1. Fetches all `active` goals with `agentConfig.enabled: true`.
2. Fetches all pending dump todos.
3. Runs all Goal Agents in parallel (`Promise.all`), catching individual failures.
4. Computes `recentLoad` — a map of `{ [goalTitle/category]: countCompleted }` for the last 3 days. Used by the orchestrator to rebalance (avoid over-scheduling one goal type).
5. Calls `OrchestratorAgent.run(context)` with all gathered data.

**System prompt** (`ORCHESTRATOR_SYSTEM`): instructs the agent to:
- Only fill the provided free slots (never touch existing calendar events).
- Schedule all dump todos.
- Choose goal-agent candidates intelligently, honouring priority and recent load.
- Insert breaks between heavy tasks, front-load energy-heavy items.
- Defer tasks if there's no room rather than cramming.

**User prompt** (`orchestratorUserPrompt`): serialises calendar events, free slots, dump todos, goal proposals, and recent load into plain text. Returns a strict JSON schema.

**Output JSON shape:**
```json
{
  "schedule": [
    {
      "time": "8:00 AM - 9:00 AM",
      "task": "...",
      "type": "calendar | dump | suggested | break",
      "goalTitle": "...",
      "reason": "..."
    }
  ],
  "summary": "...",
  "stats": { "freeSlots": N, "dumpScheduled": N, "suggestedScheduled": N, "totalFreeMinutes": N },
  "deferred": [ { "title": "...", "reason": "..." } ]
}
```

### 6.4 persistSchedule

`backend/src/agents/orchestrator/persistSchedule.js`

`persistAndEnrichSchedule(schedule)` — runs after `orchestrateDay` and before returning to the frontend:

- **`dump` slots** → title-matched against pending dump Todos. If found, attaches `todoId`. This allows the frontend's "Mark done" button to call `PATCH /api/todos/:id` which triggers goal progress update.
- **`suggested` slots** → a new `Todo` document is created (`type: suggested, source: agent, goalId: matched goal`). The new `_id` becomes `todoId` on the slot.
- **`calendar` / `break` / `free`** → `todoId: null`, no database write.

This is what closes the **memory loop**: marking a slot done → updates the Todo → updates Goal.progress → informs the next Goal Agent run.

### 6.5 Full Orchestration Flow

```
POST /api/schedule/generate
  { calendarEvents[], useGCal?, date? }
          │
          ├─ [if useGCal] fetchEventsForDate(date)
          │
          ├─ findFreeSlots(events, { dayStart, dayEnd, minStartMinutes })
          │   └─ minStartMinutes = now+5min  (only when date === today)
          │
          └─ orchestrateDay({ calendarEvents, freeSlots })
                │
                ├─ Goal.find({ status: active, agentConfig.enabled: true })
                ├─ Todo.find({ type: dump, completed: false })
                │
                ├─ Promise.all( goals.map(g => runGoalAgent(g)) )
                │   └─ each GoalAgent:
                │       fetchRecentCompletions(goalId, 5)
                │       + LLM call → candidates[]
                │
                ├─ computeRecentLoad(3 days)
                │
                ├─ OrchestratorAgent.run({ calendarEvents, freeSlots, dumpTodos, proposals, recentLoad })
                │   └─ LLM call → { schedule[], summary, stats, deferred }
                │
                └─ persistAndEnrichSchedule(schedule)
                    ├─ dump slots → link existing Todo._id
                    └─ suggested slots → create new Todo, attach _id
```

---

## 7. Google Calendar Integration

### OAuth flow

1. User clicks "Connect Google Calendar" in the frontend.
2. Frontend navigates to `GET /api/auth/google` (the `connectUrl` in `api/gcal.js`).
3. Backend redirects to Google's consent screen requesting `calendar.events` scope.
4. Google redirects to `GET /api/auth/google/callback?code=...`.
5. Backend exchanges code for tokens, saves via `tokenStore.js`, redirects to `FRONTEND_URL?gcal=connected`.
6. Frontend (`Dashboard.jsx`) detects the query param and updates state.

### Token storage

`backend/src/data/tokenStore.js` writes tokens to `.tokens.json` (local disk, gitignored). On restart, if `GOOGLE_REFRESH_TOKEN` is set in `.env`, it's used as a fallback. The Google client auto-refreshes access tokens using the refresh token.

### Scope

`https://www.googleapis.com/auth/calendar.events` — read + write to the user's calendar events. If the stored token pre-dates this scope, the backend detects a 403 and sets `needsReconnect: true` in the push response, prompting the user to disconnect and reconnect.

### Date support

All calendar operations now accept a `date` parameter (`YYYY-MM-DD`). Functions:
- `fetchEventsForDate(dateStr?)` — fetches events for any day.
- `parseTimeRangeToTodayISO(range, dateStr?)` — converts time strings to ISO for any specific calendar date.
- `insertScheduleIntoCalendar(slots, dateStr?)` — pushes slots onto the correct day.

---

## 8. Frontend Architecture

### 8.1 App Shell

```
App.jsx
└── BrowserRouter
    └── AppProvider (global state)
        └── Routes
            └── AppLayout (Sidebar + MobileNav + <Outlet>)
                ├── / → Dashboard.jsx
                ├── /goals → Goals.jsx
                └── /calendar → Calendar.jsx
```

`AppLayout.jsx` uses `flex h-screen overflow-hidden`. The outlet container is `flex-1 overflow-hidden` — each page controls its own scroll. This is important for the Calendar page which has two independent scrollable panes.

### 8.2 Global State — AppContext

`frontend/src/context/AppContext.jsx`

All cross-page state lives here. The provider wraps the entire app.

**Per-date state** (keyed by `YYYY-MM-DD`):
```js
eventsByDate   // Map: dateKey → calendarEvents[]
scheduleByDate // Map: dateKey → schedule[]
```
Exposed as computed values `calendarEvents` and `schedule` based on `selectedDate`.

**Global state:**
| Value | Description |
|---|---|
| `selectedDate` | Current calendar date (`YYYY-MM-DD`). Defaults to today. |
| `isToday` | `selectedDate === todayKey()` |
| `summary`, `stats`, `deferred` | Scheduling output — persisted to `sessionStorage` |
| `activeGoals`, `proposals` | Scheduling output — in-memory only |
| `dumpTodos`, `suggestedTodos` | Fetched on mount; refreshed after any mutation |
| `goals` | Fetched on mount; updated by Goals page |
| `gcalConnected` | Google Calendar auth status |
| `useGCal` | Whether to use live GCal events when scheduling |

**sessionStorage keys:** `events_by_date`, `schedule_by_date`, `summary`, `stats`, `deferred`.  
This prevents the schedule from resetting when the user navigates between pages.

**Utility exports:**
- `todayKey()` — returns today as `YYYY-MM-DD`.
- `dateKey(date)` — converts a `Date` object to `YYYY-MM-DD`.

### 8.3 Pages

#### `Dashboard.jsx` (`/`)

The "Today" task view. Intentionally simple — no timeline here.

**Layout:** Single centered column, max-width 3xl. Header row has title left and "Open Calendar for Today →" button top-right.

**Sections (order matters):**
1. Progress bar — `completedCount / total` across both lists.
2. **Manual Tasks** — `dumpTodos` list, first. Shows 5 by default, "View more (N more)" button to expand. Inline "Add a task…" row at the bottom with priority selector.
3. **AI Suggested** — `suggestedTodos` list, second. Same 5-item preview + "View more". "Refresh" button triggers `generateSchedule` and pushes result to `AppContext`.
4. "Open Calendar for Today →" link (navigates to `/calendar`).

**Task row interactions:**
- Checkbox → `completeTodo` / `uncompleteTodo` via API.
- Hover → reveals source badge (`AI` / `dump`), priority, optional milestone chip, delete `×` button.
- Delete → `deleteTodo` API then removes from context state.

**Constant:** `PREVIEW_COUNT = 5` at the top of the file.

#### `Goals.jsx` (`/goals`)

Milestone management page.

**Layout:** Header (count + "New Milestone" button) + scrollable card grid.

**State:**
- `showForm` — toggles the "New Milestone" accordion form.
- `expandedGoal` — which card is expanded to show agent proposals + notes.
- `proposalsByGoal` — `Map<goalId → proposal>` for inline proposal display.
- `noteDraft` — `Map<goalId → string>` for the note input per card.
- Goals are read from `useApp().goals` (set by `AppContext` on mount, refreshed after mutations).

**Goal card features:**
- Horizon + priority + category + status badges.
- Progress bar (visual only — counts completions out of 20 as 100%).
- `lastActivityAt` relative timestamp.
- "🤖 AI Suggest" → calls `proposeForGoal(id)` and shows proposals inline.
- "Pause / Activate" → `updateGoal(id, { status })`.
- "✕" → `deleteGoal(id)`.
- Expand ▼ → shows note input, recent completions, recent notes, agent proposal detail.

**Active / Paused split:** Goals are split into two grids (`active` and `paused`) below the form.

#### `Calendar.jsx` (`/calendar`)

Full-page 2-pane calendar view.

**CSS grid:** `grid-cols-1 lg:grid-cols-[1fr_380px]`. Each pane is `h-full overflow-y-auto` or `flex flex-col` with inner scroll.

**Day navigation pill** (top-right of left pane):
```
◀  [Today | Nov 14]  ▶  [Jump to today]
```
- ◀ / ▶ call `addDays(selectedDate, ±1)` → `setSelectedDate`.
- Date label is clickable (hidden `<input type="date">` positioned over it).
- "Jump to today" only renders when not on today.

**Timeline (left pane):**
- Renders hours `08:00 → 22:00`, `HOUR_HEIGHT = 72px` per hour.
- `calendarEvents` → gray locked blocks with lock icon + italic title.
- `schedule` → colored blocks per milestone (6-color palette) or neutral for dump. Each block shows: title, AI badge (if suggested), time range, goal chip, "on cal" indicator.
- Now line (red dot + horizontal) — only renders when `isToday`.
- Scroll behavior: `isToday` → scrolls to current time on mount/date-change. Other days → scrolls to 08:00.

**Right pane:**
- **"Schedule day"** (outlined) → triggers `generate()` which calls `generateSchedule({ calendarEvents, useGCal, date: selectedDate })`.
- **"Push to calendar"** (blue) → calls `pushToGCal()` which calls `pushScheduleToCalendar(pushable, selectedDate)`.
- **Agent trace card** — live log of scheduling reasoning steps. Shows `Thinking…` pulsing immediately, then real steps once the LLM responds.
- **"What got placed" card** — slots grouped by goalId → milestone title, then "Brain dump" group. Each entry: `HH:MM  Task title` + italic rationale.

**Milestone color map:** `useMemo` builds a `{ goalId → colorConfig }` map from `goals` and `activeGoals`. Colors cycle through `MILESTONE_COLORS` (indigo → emerald → amber → rose → cyan → violet). The same colors appear on calendar blocks and in the "What got placed" list.

### 8.4 API Clients

All in `frontend/src/api/`. All use `apiFetch` from `client.js`.

`client.js`:
- Reads `VITE_API_BASE` (default: `http://localhost:5001`).
- Sets `Content-Type: application/json`.
- On non-OK response, throws an `Error` with `.status` and `.data` attached.

| File | Exports |
|---|---|
| `todos.js` | `listTodos`, `createTodo`, `updateTodo`, `completeTodo`, `uncompleteTodo`, `deleteTodo` |
| `goals.js` | `listGoals`, `createGoal`, `updateGoal`, `deleteGoal`, `proposeForGoal`, `addGoalNote` |
| `schedule.js` | `generateSchedule({ calendarEvents, useGCal, date })` |
| `gcal.js` | `getStatus`, `disconnect`, `fetchTodayEvents(date?)`, `pushScheduleToCalendar(schedule, date?)`, `connectUrl` |

---

## 9. Data Flow — End to End

### Adding a task (manual)

```
User types task + Enter (Dashboard.jsx)
  → createTodo({ title, type: "dump", source: "manual", priority })
  → POST /api/todos
  → Todo.create()
  → refreshTodos() updates AppContext
  → task appears in Manual Tasks list
```

### Scheduling the day

```
User clicks "Schedule day" (Calendar.jsx)
  → generateSchedule({ calendarEvents, useGCal, date })
  → POST /api/schedule/generate
  → [if useGCal] fetchEventsForDate(date)
  → findFreeSlots(events, { minStartMinutes: now+5 })  // skip past slots on today
  → orchestrateDay({ calendarEvents, freeSlots })
      → runGoalAgent × N (parallel)
          → fetchRecentCompletions + LLM call
          → candidates[]
      → computeRecentLoad(3 days)
      → OrchestratorAgent.run()
          → LLM call → schedule[]
      → persistAndEnrichSchedule(schedule)
          → dump slots: match Todo by title → attach todoId
          → suggested slots: create new Todo → attach todoId
  → response: { schedule[], summary, stats, deferred, activeGoals, proposals }
  → AppContext.setSchedule() → blocks appear on timeline
  → agentTrace[] reveals reasoning steps
```

### Completing a task

```
User clicks "Mark done" on a calendar block (Calendar.jsx)
  → toggleDone(slot)  [slot.todoId must be set]
  → completeTodo(slot.todoId)
  → PATCH /api/todos/:id { completed: true }
  → sets completedAt = new Date()
  → if goalId: applyTodoCompletionToGoal()
      → Goal.progress.completedCount++
      → Goal.progress.lastActivityAt = now
  → refreshTodos() refreshes AppContext
  → next Goal Agent run sees updated recentCompletions + lastActivityAt
```

### Goal Agent feedback loop

```
Goal.progress.completedCount  ─┐
Goal.progress.lastActivityAt  ─┤
Goal.progress.notes[]         ─┤ → GoalAgent context
recentCompletions (last 5)    ─┘

                              ↓ LLM
                        candidates[]
                              ↓
                      OrchestratorAgent
                              ↓
                      schedule (no repeats,
                       gaps addressed)
```

---

## 10. Key Design Decisions

### Why `response_format: json_object`?
Both agents are prompted to return only valid JSON and use OpenAI's JSON mode. This eliminates markdown fences and parse errors. The model is `gpt-3.5-turbo` by default — switch to `gpt-4o` in `.env` for significantly better scheduling quality.

### Why hub-and-spoke instead of agent-to-agent communication?
Goal Agents run in parallel and don't communicate. They produce proposals independently. The Orchestrator sees all proposals and makes the final call. This avoids deadlocks, reduces latency, and keeps the system deterministic enough to debug.

### Why `persistAndEnrichSchedule` runs on every schedule generation?
The orchestrator's `suggested` slots are ephemeral (only in the LLM response). Persisting them as `Todo` documents immediately allows: (a) the "Mark done" button to work, (b) goal progress tracking, and (c) avoiding duplicate creation — since the next generation will see existing suggested todos via `recentCompletions`.

### Why per-date state in `AppContext`?
Schedule and events are stored as `{ [dateKey]: data }` maps in `sessionStorage`. This means:
- Navigating between Today / Milestones / Calendar never loses the schedule.
- Switching the calendar from today to tomorrow doesn't clobber today's data.
- Each day's schedule is independently generated and cached.

### Why `minStartMinutes` only on today?
For past and future days, the full `08:00–22:00` window is schedulable (you might want to plan a future day or review a past one). Only today needs the "don't schedule the past" guard. The `5-minute` buffer prevents scheduling a slot that starts in the next few seconds while the LLM is still thinking.

---

## 11. API Reference

### POST `/api/schedule/generate`

**Request:**
```json
{
  "calendarEvents": [
    { "title": "Team standup", "startTime": "9:00 AM", "endTime": "9:30 AM" }
  ],
  "useGCal": false,
  "date": "2026-05-15"
}
```

**Response:**
```json
{
  "source": "manual | gcal",
  "date": "2026-05-15",
  "schedule": [
    {
      "time": "8:00 AM - 9:00 AM",
      "task": "Write 3 LinkedIn posts",
      "type": "suggested",
      "goalTitle": "Build Personal Brand",
      "reason": "High urgency from goal agent; no activity in 5 days",
      "todoId": "abc123"
    }
  ],
  "summary": "...",
  "stats": { "freeSlots": 4, "dumpScheduled": 3, "suggestedScheduled": 2, "totalFreeMinutes": 210 },
  "deferred": [{ "title": "...", "reason": "..." }],
  "proposals": [...],
  "activeGoals": [...],
  "calendarEvents": [...],
  "freeSlots": [{ "start": 480, "end": 540, "duration": 60, "startLabel": "8:00 AM", "endLabel": "9:00 AM" }],
  "timestamp": "..."
}
```

### GET `/api/gcal/events/today?date=YYYY-MM-DD`

**Response:**
```json
{
  "events": [
    { "id": "...", "title": "...", "startTime": "9:00 AM", "endTime": "10:00 AM", "source": "gcal" }
  ],
  "count": 1,
  "date": "2026-05-15"
}
```

### PATCH `/api/todos/:id`

**Request:**
```json
{ "completed": true }
```

**Response:**
```json
{
  "todo": { "_id": "...", "completed": true, "completedAt": "..." },
  "goal": { "_id": "...", "progress": { "completedCount": 4, "lastActivityAt": "..." } }
}
```

---

## 12. Common Gotchas

| Problem | Cause | Fix |
|---|---|---|
| GCal push returns 403 `insufficient authentication scopes` | Token was generated before `calendar.events` scope | Disconnect → reconnect Google Calendar |
| `Error 400: redirect_uri_mismatch` on OAuth | `GOOGLE_REDIRECT_URI` in `.env` doesn't exactly match what's in Google Console | Copy the URI from the console exactly, including `/callback` |
| `Error 403: access_denied` (verification) | Google app in Testing mode, signed-in email not in "Test users" | Add email in GCP → OAuth consent screen → Test users |
| Schedule fills past time slots | `date` param not sent, or `isToday` check failed | Ensure frontend sends `date: selectedDate` in `generateSchedule` call |
| Agent proposals are empty | No active goals with `agentConfig.enabled: true` | Create a milestone on `/goals`; it defaults to enabled |
| `[AgentBase] Failed to parse JSON` | LLM returned markdown instead of JSON | Usually transient; retry. If persistent, switch to `gpt-4o` |
| Page scroll jumps to bottom on day change | Old `useEffect` depended only on mount | Fixed: `useEffect` depends on `[selectedDate, isToday]`, non-today days scroll to top |
| Todos disappear after navigating away | State was in local component state | Fixed: all state lives in `AppContext` backed by `sessionStorage` |
| `&&` syntax error in PowerShell | PowerShell doesn't support `&&` as command separator | Use `;` or run commands separately |

---

## 13. Research Agent

A per-milestone deep-research agent built on LangGraph.js. Unlike the one-shot "AI Suggest" (`POST /api/goals/:id/propose`), the Research agent runs an iterative ReAct loop with five external tools, streams its trace to a dedicated page, and asks the user to approve or decline the proposals before creating any Todos.

### How to trigger

On the Milestones (`/goals`) page, each GoalCard has a **Research** button (purple, magnifying glass icon) next to "AI Suggest". Clicking it:
1. Calls `POST /api/research/start` with `{ goalId }`.
2. Navigates immediately to `/research/:runId` — the live trace page.
3. The agent runs in the background while the trace page streams events via SSE.

### Architecture

```
GoalCard [Research btn]
  │ POST /api/research/start
  ▼
research.routes.js
  ├─ creates ResearchRun (MongoDB)
  ├─ fires runAgentBackground() in background
  └─ returns { runId }

/research/:runId page
  │ GET /api/research/runs/:runId/stream  (SSE)
  ▼
ResearchAgent.js  (LangGraph ReAct)
  ├─ planner node  (ChatOpenAI.bindTools)
  ├─ tools node    (ToolNode)
  │     ├─ googleDocs    — search Drive + read Docs
  │     ├─ emailRead     — Gmail inbox search
  │     ├─ emailWrite    — Gmail draft/send
  │     ├─ webSearch     — Tavily REST API
  │     └─ browserUse   — browser-use API (screenshots, brand analysis)
  └─ summarizer node  (extracts proposals JSON)
```

### New files

| Path | Purpose |
|------|---------|
| `backend/src/agents/research/ResearchAgent.js` | LangGraph graph + `runResearchAgent()` |
| `backend/src/agents/research/prompts.js` | System prompt + user prompt builder |
| `backend/src/agents/research/tools/googleDocs.tool.js` | Drive search + Docs read |
| `backend/src/agents/research/tools/emailRead.tool.js` | Gmail search |
| `backend/src/agents/research/tools/emailWrite.tool.js` | Gmail draft/send |
| `backend/src/agents/research/tools/webSearch.tool.js` | Tavily web search |
| `backend/src/agents/research/tools/browserUse.tool.js` | Browser automation API |
| `backend/src/models/ResearchRun.js` | Mongo schema: run status, events[], proposals[] |
| `backend/src/routes/research.routes.js` | REST + SSE endpoints |
| `backend/src/config/googleScopes.js` | Canonical Google OAuth scope list |
| `backend/.env.research.example` | API config reference with setup instructions |
| `frontend/src/pages/Research.jsx` | Trace timeline + proposals panel page |
| `frontend/src/api/research.js` | Frontend API client |

### API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/research/start` | Start a run; returns `{ runId }` |
| GET | `/api/research/runs/:runId/stream` | SSE stream of agent events |
| GET | `/api/research/runs/:runId` | Full run snapshot (for page hydration) |
| POST | `/api/research/runs/:runId/approve` | Create Todos for selected proposals; body: `{ selected?: number[] }` |
| POST | `/api/research/runs/:runId/decline` | Mark run declined |

### SSE event types

| Event | `data` shape | Meaning |
|-------|-------------|---------|
| `thought` | `{ text }` | Agent reasoning text |
| `tool_call` | `{ tool, args }` | Tool invocation starting |
| `tool_result` | `{ tool, output }` | Tool returned (screenshots inside `output.screenshots` for browserUse) |
| `proposals` | `{ proposals[], summary }` | Final proposals ready |
| `done` | `{ status }` | Agent finished (`awaiting_approval` or `error`) |
| `needs_reconnect` | `{ message }` | Google token invalid; user must reconnect |
| `error` | `{ message }` | Non-recoverable agent error |

### Configuration (new env vars)

See `backend/.env.research.example` for full setup instructions. Key additions:

| Var | Required | Purpose |
|-----|----------|---------|
| `TAVILY_API_KEY` | Yes | Web search (get at tavily.com) |
| `BROWSER_USE_API_URL` | Yes | Your browser-use API endpoint |
| `BROWSER_USE_API_KEY` | Yes | Browser-use auth key |
| `EMAIL_WRITER_MODE` | No | `draft` (default) or `send` |
| `LANGSMITH_API_KEY` | No | Optional LangSmith tracing |

Google scopes must be extended in Google Cloud Console (Gmail, Docs, Drive) and users must Disconnect + Reconnect to get a token covering the new scopes.

### Three example milestones (exercise all five tools)

**a) "Land a senior backend role at a NYC startup"** (1 month, priority 1)
- `googleDocs` — reads Resume.gdoc + Career-notes.gdoc
- `webSearch` — finds NYC startup job listings
- `browserUse` — screenshots job pages, brand-analyzes companies
- `emailRead` — searches past recruiter threads
- `emailWrite` — drafts cold-outreach emails
- Proposals: tailor resume, send drafts, apply to top picks

**b) "Launch newsletter and reach 1k subscribers"** (3 months, priority 2)
- `googleDocs` — reads draft posts from Drive
- `webSearch` — finds trending topics in your niche
- `browserUse` — screenshots competitor Substacks
- `emailRead` — scans subscriber feedback
- `emailWrite` — drafts welcome email + this week's issue
- Proposals: publish post, set up referral program, reply to early subscribers

**c) "Get conversational in Spanish before October trip"** (6 months, priority 3)
- `googleDocs` — reads vocab notebook in Drive
- `webSearch` — finds best Spanish podcasts for B1 learners
- `browserUse` — compares italki vs Pimsleur vs Babbel pricing with screenshots
- `emailRead` — searches past tutor recap emails
- `emailWrite` — drafts trial-lesson requests to tutors
- Proposals: daily Anki review, book trial tutor session, listen to podcast episode
