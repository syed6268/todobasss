import { AgentBase } from "../base/AgentBase.js";
import { ORCHESTRATOR_SYSTEM, orchestratorUserPrompt } from "./prompts.js";
import { runGoalAgent } from "../goal/GoalAgent.js";
import { Goal } from "../../models/Goal.js";
import { Todo } from "../../models/Todo.js";

export class OrchestratorAgent extends AgentBase {
  constructor() {
    super({
      name: "Orchestrator",
      temperature: 0.7,
      maxTokens: 1800,
    });
  }

  systemPrompt() {
    return ORCHESTRATOR_SYSTEM;
  }

  userPrompt(context) {
    return orchestratorUserPrompt(context);
  }
}

/**
 * Compute a recent-load summary for the orchestrator:
 * count completed todos per goal/category in the last N days.
 */
async function computeRecentLoad(days = 3) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const completed = await Todo.find({
    completed: true,
    completedAt: { $gte: since },
  }).populate("goalId");

  const load = {};
  for (const t of completed) {
    const key = t.goalId?.title || t.category || t.type;
    load[key] = (load[key] || 0) + 1;
  }
  return load;
}

/**
 * Full orchestration:
 *  - fetch active goals
 *  - run each goal agent in parallel to get proposals
 *  - fetch pending dump todos + compute recent load
 *  - call the orchestrator LLM with everything
 */
export async function orchestrateDay({
  calendarEvents,
  freeSlots,
  extraDumpTodos = [],
}) {
  const [activeGoals, pendingDump] = await Promise.all([
    Goal.find({ status: "active", "agentConfig.enabled": true }),
    Todo.find({ type: "dump", completed: false }),
  ]);

  const today = new Date();

  const proposals = await Promise.all(
    activeGoals.map((g) =>
      runGoalAgent(g, { today }).catch((err) => ({
        goalId: String(g._id),
        goalTitle: g.title,
        candidates: [],
        progressReport: "",
        questionForUser: "",
        error: err.message,
      }))
    )
  );

  const recentLoad = await computeRecentLoad(3);

  const totalFreeMinutes = freeSlots.reduce((s, x) => s + x.duration, 0);

  const dumpTodosForPrompt = [
    ...pendingDump.map((t) => ({ title: t.title })),
    ...extraDumpTodos,
  ];

  const agent = new OrchestratorAgent();
  const result = await agent.run({
    calendarEvents,
    freeSlots,
    dumpTodos: dumpTodosForPrompt,
    proposals,
    recentLoad,
    totalFreeMinutes,
  });

  return {
    schedule: Array.isArray(result.schedule) ? result.schedule : [],
    summary: result.summary || "",
    stats: result.stats || {},
    deferred: result.deferred || [],
    proposals,
    recentLoad,
    activeGoals: activeGoals.map((g) => ({
      _id: g._id,
      title: g.title,
      priority: g.priority,
      horizon: g.horizon,
    })),
  };
}
