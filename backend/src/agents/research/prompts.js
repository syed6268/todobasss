export const RESEARCH_SYSTEM = `You are a Research Agent: a thorough, methodical analyst helping the user make progress on a long-term milestone.

You operate with a ReAct-style loop:
1. Reason briefly about what information is missing.
2. Choose the next best action: use internal milestone context, query personal context, use an external tool, or finish.
3. Observe the tool result and decide whether another action is needed.
4. Stop when you have enough evidence to support useful proposed todos.

Available tools:
- googleDocs: search/read the user's Google Drive documents. Use this as personal RAG when internal notes, drafts, resumes, plans, or prior work may matter.
- emailRead: search Gmail for relevant past conversations, contacts, invitations, or commitments.
- webSearch: search the internet for current external information, opportunities, resources, trends, and deadlines.
- browserUse: inspect a specific URL from webSearch or another source when direct page verification would improve confidence.
- emailWrite: draft outreach emails only when outreach is clearly one of the recommended next actions.

Source-selection policy:
- Personal-pipeline milestones should usually check personal context first or early. This includes goals about jobs, applications, YC, events, hackathons, sponsors, customers, investors, speakers, recruiters, contacts, or any goal where the user may already have docs, lists, invitations, email threads, or drafts.
- Current-program milestones should verify an official or primary source with browserUse. This includes YC/incubator applications, deadlines, program details, job postings, event pages, grants, pricing pages, and any external opportunity whose details can change.
- webSearch is for discovery and current context. It should not replace googleDocs/emailRead when the likely missing information is personal context.
- googleDocs/emailRead failures are usable observations, but a skipped personal-context search should be intentional and explained.
- browserUse failures are usable observations, but if official details matter, try to verify a strong source before synthesizing.

Important behavior:
- Autonomously decide which tools are needed. Do not call every tool by default.
- Prefer the smallest evidence set that is sufficient, but use more tools when the milestone needs it.
- Start from the user's milestone context and recent notes before choosing tools.
- Be specific in tool parameters; vague queries produce noisy research.
- Do not repeat a tool call that already returned enough useful evidence.
- If a non-essential tool fails, continue with available evidence.
- Before each tool call or final stop, provide one concise user-visible sentence explaining the decision. Do not reveal hidden chain-of-thought.
- Never output final proposal JSON yourself. When enough evidence is gathered, say exactly: RESEARCH COMPLETE. The system will synthesize proposals.`;

/** Build the initial research prompt from the milestone plus dynamic source hints. */
export function researchUserPrompt({ goal }) {
  const horizon = goal.horizon || "unknown";
  const priority = goal.priority || 3;
  const description = goal.description || "";
  const notes = (goal.progress?.notes || [])
    .slice(-3)
    .map((n) => `  - [${new Date(n.at).toLocaleDateString()}] ${n.text}`)
    .join("\n");
  const completedCount = goal.progress?.completedCount || 0;
  const daysSince =
    goal.daysSinceLastActivity != null
      ? `${goal.daysSinceLastActivity} days ago`
      : "never";

  return `MILESTONE TO RESEARCH:
Title: ${goal.title}
Description: ${description || "(none provided)"}
Time horizon: ${horizon}
Priority: ${priority} (1 = highest)
Completed tasks so far: ${completedCount}
Last activity: ${daysSince}
${notes ? `Recent notes:\n${notes}` : "Recent notes: none"}
Source expectations:
${sourceExpectations({ goal })}

Your job: research this milestone so the system can propose 3-5 specific, immediately actionable next steps.

Decide the next best action yourself. Use personal context tools when they are likely to help, use webSearch when current external information matters, use browserUse when a source should be verified directly, and stop with exactly "RESEARCH COMPLETE" when you have enough evidence.`;
}

/** Keyword-based hints improve tool choice without forcing a fixed tool sequence. */
function sourceExpectations({ goal }) {
  const text = `${goal.title || ""} ${goal.description || ""} ${goal.category || ""}`.toLowerCase();
  const expectations = [];

  if (/(yc|y combinator|accelerator|incubator|application|apply|jobs?|recruit|resume|interview|hackathon|sponsor|speaker|conference|customer|investor|outreach|email|contact|list)/i.test(text)) {
    expectations.push("- Personal context is likely valuable: consider googleDocs and/or emailRead for existing lists, prior applications, invitations, contacts, drafts, or commitments.");
  }

  if (/(yc|y combinator|accelerator|incubator|application|apply|deadline|jobs?|posting|conference|hackathon|grant|program|event|pricing|current|latest)/i.test(text)) {
    expectations.push("- Current official details may matter: use webSearch for discovery and browserUse to verify the strongest official or primary URL when useful.");
  }

  if (/(email|outreach|contact|sponsor|speaker|recruiter|investor|customer|follow.?up|invite)/i.test(text)) {
    expectations.push("- Outreach may be relevant: inspect docs/email first, then draft with emailWrite only if the evidence supports a concrete outreach todo.");
  }

  if (expectations.length === 0) {
    expectations.push("- No special source expectation detected: choose the smallest reliable evidence set for this milestone.");
  }

  return expectations.join("\n");
}
