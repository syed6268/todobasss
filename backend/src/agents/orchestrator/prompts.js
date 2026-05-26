export const ORCHESTRATOR_SYSTEM = `You are the Orchestrator — an elite AI productivity strategist.

You receive:
- The user's existing calendar events for today (DO NOT modify).
- Free time slots between those events.
- The user's dump todos (everyday things, MUST get scheduled).
- Proposed candidate todos from per-goal specialist agents (Goal Agents).
- Recent activity load (which goal types the user has done a lot of lately).

Your job:
1. Build a balanced, realistic daily schedule that fills ONLY the free slots.
2. Schedule all dump todos.
3. Choose goal-agent candidates intelligently:
   - Honor goal priority (1 = highest).
   - Prefer high-urgency candidates from goal agents that haven't had activity recently.
   - Don't stack the schedule with only one goal type — rotate when reasonable.
   - Use recent activity load to rebalance (if last 3 days were heavy on "career", schedule fewer career items and more under-served goals).
4. Insert short breaks between cognitively heavy tasks.
5. Schedule energy-heavy tasks in morning, lighter in evening.
6. Be honest: if there's no room, drop lower-priority candidates rather than cramming.

Always return ONLY valid JSON.`;

export function orchestratorUserPrompt({
  calendarEvents,
  freeSlots,
  dumpTodos,
  proposals,
  recentLoad,
  totalFreeMinutes,
}) {
  const calendarStr = calendarEvents.length
    ? calendarEvents.map((e) => `${e.startTime} - ${e.endTime}: ${e.title}`).join("\n")
    : "None - empty calendar";

  const freeStr = freeSlots.length
    ? freeSlots.map((s) => `${s.startLabel} - ${s.endLabel} (${s.duration} min)`).join("\n")
    : "No free slots";

  const dumpStr =
    dumpTodos.map((t) => `- ${t.title}`).join("\n") || "(no dump todos pending)";

  const proposalsStr =
    proposals
      .map((p) => {
        const cands = p.candidates
          .map(
            (c) =>
              `    * [${c.urgency} urgency, ${c.estimatedMinutes ?? 30}min, ${c.energyCost}] ${c.title} — ${c.rationale || ""}`
          )
          .join("\n");
        return `Goal: ${p.goalTitle}\n  Progress: ${p.progressReport || "(no report)"}\n  Candidates:\n${cands || "    (no candidates)"}`;
      })
      .join("\n\n") || "(no goal agent proposals)";

  const loadStr =
    Object.entries(recentLoad || {})
      .map(([k, v]) => `  ${k}: ${v} tasks in last 3 days`)
      .join("\n") || "  (no history yet)";

  return `EXISTING CALENDAR EVENTS (keep exactly, type "calendar"):
${calendarStr}

FREE SLOTS AVAILABLE (${totalFreeMinutes} total minutes):
${freeStr}

DUMP TODOS (everyday — must all be scheduled):
${dumpStr}

GOAL AGENT PROPOSALS:
${proposalsStr}

RECENT ACTIVITY LOAD:
${loadStr}

Return JSON:
{
  "schedule": [
    {
      "time": "8:00 AM - 9:00 AM",
      "task": "Concrete task title",
      "type": "calendar" | "dump" | "suggested" | "break",
      "goalTitle": "name of goal if this is a goal-agent suggestion, else null",
      "reason": "1 sentence on why this is here right now"
    }
  ],
  "summary": "2-3 sentence overview of the day and the trade-offs you made",
  "stats": {
    "freeSlots": ${freeSlots.length},
    "dumpScheduled": 0,
    "suggestedScheduled": 0,
    "totalFreeMinutes": ${totalFreeMinutes}
  },
  "deferred": [
    { "title": "candidate not scheduled", "reason": "why deferred" }
  ]
}`;
}
