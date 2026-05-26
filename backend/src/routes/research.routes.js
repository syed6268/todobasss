import { Router } from "express";
import { Goal } from "../models/Goal.js";
import { Todo } from "../models/Todo.js";
import { ResearchRun } from "../models/ResearchRun.js";
import { runResearchAgent } from "../agents/research/ResearchAgent.js";
import { assertResearch } from "../config/env.js";

const router = Router();

// ── POST /api/research/start ───────────────────────────────────────────────
// Creates a ResearchRun and kicks off the agent in the background.
// Returns { runId } immediately so the frontend can navigate to the trace page.
router.post("/start", async (req, res) => {
  const { goalId } = req.body || {};
  if (!goalId) return res.status(400).json({ error: "goalId is required" });

  let goal;
  try {
    goal = await Goal.findById(goalId);
  } catch {
    return res.status(400).json({ error: "Invalid goalId" });
  }
  if (!goal) return res.status(404).json({ error: "Goal not found" });

  try {
    assertResearch();
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  // Create the run document
  const run = await ResearchRun.create({
    goalId: goal._id,
    goalTitle: goal.title,
    status: "running",
    events: [],
    proposals: [],
    summary: "",
  });

  // Fire agent in background — do NOT await
  runAgentBackground(run._id, goal).catch(console.error);

  res.json({ runId: run._id });
});

// ── GET /api/research/runs/:runId/stream ──────────────────────────────────
// SSE endpoint. Streams live events while the agent runs.
// On reconnect (status still 'running'), replays persisted events then continues.
router.get("/runs/:runId/stream", async (req, res) => {
  const { runId } = req.params;

  let run;
  try {
    run = await ResearchRun.findById(runId);
  } catch {
    return res.status(400).json({ error: "Invalid runId" });
  }
  if (!run) return res.status(404).json({ error: "Run not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (type, data) => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Replay already-stored events on reconnect
  for (const evt of run.events) {
    send(evt.type, evt.data);
  }

  // If already finished, send final state and close
  if (run.status !== "running") {
    send("done", { status: run.status });
    return res.end();
  }

  // Subscribe to live events via our in-memory emitter
  const emitter = getRunEmitter(String(runId));

  const onEvent = (type, data) => send(type, data);
  const onDone = (status) => {
    send("done", { status });
    res.end();
  };

  emitter.on("event", onEvent);
  emitter.on("done", onDone);

  req.on("close", () => {
    emitter.off("event", onEvent);
    emitter.off("done", onDone);
  });
});

// ── GET /api/research/runs/:runId ─────────────────────────────────────────
// Full snapshot of a run (for page hydration on load/refresh).
router.get("/runs/:runId", async (req, res) => {
  try {
    const run = await ResearchRun.findById(req.params.runId).lean();
    if (!run) return res.status(404).json({ error: "Run not found" });
    res.json({ run });
  } catch {
    res.status(400).json({ error: "Invalid runId" });
  }
});

// ── POST /api/research/runs/:runId/approve ────────────────────────────────
// Creates Todos for selected proposals and marks run approved.
router.post("/runs/:runId/approve", async (req, res) => {
  const { selected } = req.body || {}; // optional array of proposal indices

  let run;
  try {
    run = await ResearchRun.findById(req.params.runId);
  } catch {
    return res.status(400).json({ error: "Invalid runId" });
  }
  if (!run) return res.status(404).json({ error: "Run not found" });
  if (run.status !== "awaiting_approval") {
    return res.status(400).json({ error: `Run is in status "${run.status}" — cannot approve` });
  }

  const proposals =
    Array.isArray(selected) && selected.length > 0
      ? selected.map((i) => run.proposals[i]).filter(Boolean)
      : run.proposals;

  const createdTodos = [];
  for (const p of proposals) {
    const todo = await Todo.create({
      title: p.title,
      description: p.rationale || "",
      type: "suggested",
      goalId: run.goalId,
      source: "agent",
      priority: p.priority || 3,
      estimatedMinutes: p.estimatedMinutes || 30,
      energyCost: p.energyCost || "medium",
    });
    createdTodos.push(todo);
  }

  run.status = "approved";
  run.createdTodoIds = createdTodos.map((t) => t._id);
  await run.save();

  res.json({ approved: true, createdTodos });
});

// ── POST /api/research/runs/:runId/decline ────────────────────────────────
router.post("/runs/:runId/decline", async (req, res) => {
  try {
    const run = await ResearchRun.findByIdAndUpdate(
      req.params.runId,
      { status: "declined" },
      { new: true }
    );
    if (!run) return res.status(404).json({ error: "Run not found" });
    res.json({ declined: true });
  } catch {
    res.status(400).json({ error: "Invalid runId" });
  }
});

export default router;

// ── Internal helpers ───────────────────────────────────────────────────────

import { EventEmitter } from "events";

/** In-memory map of runId -> EventEmitter. Cleaned up after run finishes. */
const runEmitters = new Map();

function getRunEmitter(runId) {
  if (!runEmitters.has(runId)) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(20);
    runEmitters.set(runId, emitter);
  }
  return runEmitters.get(runId);
}

function cleanupEmitter(runId) {
  const emitter = runEmitters.get(runId);
  if (emitter) {
    emitter.removeAllListeners();
    runEmitters.delete(runId);
  }
}

/**
 * Run the research agent in the background.
 * Persists each event to MongoDB and broadcasts via EventEmitter.
 */
async function runAgentBackground(runId, goal) {
  const emitter = getRunEmitter(String(runId));

  // These event types are high-frequency streaming events — broadcast but don't
  // store in MongoDB (they'd bloat the events array and aren't needed for replay).
  const NON_PERSISTED = new Set(["browser_step", "browser_live_url"]);

  const onEvent = async (type, data) => {
    if (!NON_PERSISTED.has(type)) {
      await ResearchRun.findByIdAndUpdate(runId, {
        $push: { events: { type, data, ts: new Date() } },
      });
    }
    // Broadcast to any connected SSE clients
    emitter.emit("event", type, data);
  };

  try {
    const { proposals, summary } = await runResearchAgent(goal, runId, onEvent);

    // Persist proposals and mark awaiting_approval
    await ResearchRun.findByIdAndUpdate(runId, {
      status: "awaiting_approval",
      proposals,
      summary,
    });

    await onEvent("proposals", { proposals, summary });
    await onEvent("done", { status: "awaiting_approval" });
    emitter.emit("done", "awaiting_approval");
  } catch (err) {
    // Tools no longer throw — but catch any unexpected graph-level errors here
    const isReconnect = err.message?.includes("NEEDS_RECONNECT") || err.message?.includes("invalid_grant");
    const type = isReconnect ? "needs_reconnect" : "error";
    const data = { message: err.message };

    await ResearchRun.findByIdAndUpdate(runId, {
      status: "error",
      $push: { events: { type, data, ts: new Date() } },
    });

    emitter.emit("event", type, data);
    emitter.emit("done", "error");
  } finally {
    setTimeout(() => cleanupEmitter(String(runId)), 30_000);
  }
}
