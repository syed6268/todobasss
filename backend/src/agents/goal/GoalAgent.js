import { AgentBase } from "../base/AgentBase.js";
import { GOAL_AGENT_SYSTEM, goalAgentUserPrompt } from "./prompts.js";
import { fetchRecentCompletions } from "../../services/progress.service.js";

export class GoalAgent extends AgentBase {
  constructor(goal) {
    super({
      name: `GoalAgent:${goal.title}`,
      temperature: 0.7,
      maxTokens: 800,
    });
    this.goal = goal;
  }

  systemPrompt() {
    const custom = this.goal.agentConfig?.customInstructions;
    return custom
      ? `${GOAL_AGENT_SYSTEM}\n\nAdditional instructions for this specific goal:\n${custom}`
      : GOAL_AGENT_SYSTEM;
  }

  userPrompt(context) {
    return goalAgentUserPrompt({
      goal: this.goal,
      today: context.today,
      recentCompletions: context.recentCompletions || [],
      recentNotes: context.recentNotes || [],
    });
  }
}

async function buildContext(goal, baseContext = {}) {
  const recentCompletions = await fetchRecentCompletions(goal._id, 5);
  const recentNotes = (goal.progress?.notes || []).slice(-3).reverse();
  return {
    today: baseContext.today || new Date(),
    recentCompletions,
    recentNotes,
    ...baseContext,
  };
}

export async function runGoalAgent(goal, baseContext = {}) {
  const context = await buildContext(goal, baseContext);
  const agent = new GoalAgent(goal);
  const result = await agent.run(context);

  return {
    goalId: String(goal._id),
    goalTitle: goal.title,
    candidates: Array.isArray(result.candidates) ? result.candidates : [],
    progressReport: result.progressReport || "",
    questionForUser: result.questionForUser || "",
    recentCompletions: context.recentCompletions,
    generatedAt: new Date().toISOString(),
  };
}
