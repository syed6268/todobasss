export const GOAL_AGENT_SYSTEM = `You are a specialized AI assistant dedicated to ONE life goal.

Your job is to:
1. Propose 1-3 small, concrete candidate todos that move the goal forward TODAY.
2. Estimate urgency for each candidate (low | medium | high).
3. Briefly note the user's progress (or lack thereof) using their recent completions.
4. Optionally ask the user 1 question to learn about their progress.

You always respect:
- The goal's horizon (1week, 1month, 3months, 6months, 1year, 5years).
- The goal's priority (1 = highest).
- Days since last activity (longer gap = higher urgency).
- Recent completions: DO NOT repeat tasks the user just did. Build on them.
- Recent user notes: incorporate what they told you.
- That the user has OTHER goals competing for attention — keep proposals small and respectful.

You always return ONLY valid JSON.`;

export function goalAgentUserPrompt({ goal, today, recentCompletions, recentNotes }) {
  const daysSince = goal.daysSinceLastActivity;
  const targetStr = goal.targetDate
    ? new Date(goal.targetDate).toISOString().split("T")[0]
    : "no specific deadline";

  const completionsStr = (recentCompletions || []).length
    ? recentCompletions
        .map(
          (c) =>
            `- "${c.title}" on ${c.completedAt ? new Date(c.completedAt).toISOString().split("T")[0] : "?"}`
        )
        .join("\n")
    : "(none yet)";

  const notesStr = (recentNotes || []).length
    ? recentNotes
        .map(
          (n) =>
            `- "${n.text}" (${n.at ? new Date(n.at).toISOString().split("T")[0] : "?"})`
        )
        .join("\n")
    : "(none)";

  return `Goal: ${goal.title}
Description: ${goal.description || "(none)"}
Category: ${goal.category || "(none)"}
Horizon: ${goal.horizon}
Priority: ${goal.priority} (1 = highest)
Target date: ${targetStr}
Started: ${new Date(goal.startDate).toISOString().split("T")[0]}
Today: ${today.toISOString().split("T")[0]}
Days since last activity on this goal: ${daysSince ?? "no activity yet"}
Total completed actions toward this goal: ${goal.progress?.completedCount ?? 0}
Custom instructions from user: ${goal.agentConfig?.customInstructions || "(none)"}

RECENT COMPLETIONS for this goal (use to avoid repeating):
${completionsStr}

RECENT NOTES from the user about this goal:
${notesStr}

Return JSON in this exact shape:
{
  "goalId": "${goal._id}",
  "candidates": [
    {
      "title": "concrete action under 8 words",
      "description": "1 sentence on what to do and why",
      "estimatedMinutes": 30,
      "energyCost": "low" | "medium" | "high",
      "urgency": "low" | "medium" | "high",
      "rationale": "why this fits today given progress + deadline; reference recent completions when relevant"
    }
  ],
  "progressReport": "1-2 sentences on where the user stands, citing recent activity",
  "questionForUser": "optional single question, or empty string"
}`;
}
