import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";

import { config } from "../../config/env.js";
import { RESEARCH_SYSTEM, researchUserPrompt } from "./prompts.js";
import { googleDocsTool } from "./tools/googleDocs.tool.js";
import { emailReadTool } from "./tools/emailRead.tool.js";
import { emailWriteTool } from "./tools/emailWrite.tool.js";
import { webSearchTool } from "./tools/webSearch.tool.js";
import { createBrowserUseTool } from "./tools/browserUse.tool.js";

const EVIDENCE_TOOL_NAMES = ["googleDocs", "emailRead", "webSearch", "browserUse"];
const MAX_PLANNER_STEPS = 10;

/** Build the tool list per-run so browserUse gets the live onEvent callback. */
function buildTools(onEvent) {
  return [
    googleDocsTool,
    emailReadTool,
    emailWriteTool,
    webSearchTool,
    createBrowserUseTool(onEvent),
  ];
}

/** Planner model: decides the next action and can return structured tool calls. */
function createPlannerModel(tools) {
  return new ChatOpenAI({
    apiKey: config.openai.apiKey,
    model: "gpt-4o-mini",
    temperature: 0,
  }).bindTools(tools);
}

function createSummarizerModel() {
  return new ChatOpenAI({
    apiKey: config.openai.apiKey,
    model: "gpt-4o-mini",
    temperature: 0.3,
  });
}

/**
 * Lightweight routing guardrail.
 * The model still chooses actions, but these hints stop it from finishing before
 * checking obviously relevant sources for goals like YC, jobs, or hackathons.
 */
function expectedToolsForGoal(goal) {
  const text = `${goal.title || ""} ${goal.description || ""} ${goal.category || ""}`.toLowerCase();
  const expected = new Set();

  if (/(yc|y combinator|accelerator|incubator|application|apply|jobs?|recruit|resume|interview|hackathon|sponsor|speaker|conference|customer|investor|outreach|email|contact|list)/i.test(text)) {
    expected.add("googleDocs");
    expected.add("emailRead");
  }

  if (/(yc|y combinator|accelerator|incubator|application|apply|deadline|jobs?|posting|conference|hackathon|grant|program|event|pricing|current|latest)/i.test(text)) {
    expected.add("webSearch");
    expected.add("browserUse");
  }

  return expected;
}

/** Tool outputs may arrive as strings or JSON; normalize them safely. */
function safeJsonParse(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asToolContent(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function hasToolError(parsed) {
  return Boolean(parsed && typeof parsed === "object" && parsed.error);
}

/** Short text shown in the trace header for each tool result. */
function summarizeToolOutput(toolName, parsed) {
  if (typeof parsed === "string") {
    return parsed.length > 180 ? `${parsed.slice(0, 180)}...` : parsed;
  }

  if (!parsed || typeof parsed !== "object") return "Tool returned an empty response.";

  if (parsed.error) {
    return `${parsed.error}: ${parsed.message || "Tool returned an error."}`;
  }

  const results = Array.isArray(parsed.results) ? parsed.results : null;
  if (results) {
    const label =
      toolName === "emailRead"
        ? "email"
        : toolName === "googleDocs"
          ? "document"
          : "result";
    return `Found ${results.length} ${label}${results.length === 1 ? "" : "s"}.`;
  }

  if (toolName === "browserUse") {
    const screenshots = parsed.screenshots || parsed.screenshot_urls || [];
    const summary = parsed.summary || "Browser task completed.";
    return screenshots.length
      ? `${summary} Captured ${screenshots.length} screenshot${screenshots.length === 1 ? "" : "s"}.`
      : summary;
  }

  if (toolName === "emailWrite") {
    return parsed.action === "sent"
      ? `Email sent to ${parsed.to || "recipient"}.`
      : `Draft created for ${parsed.to || "recipient"}.`;
  }

  if (parsed.answer) return String(parsed.answer).slice(0, 220);
  return "Tool completed.";
}

/** Tell the user what the agent learned after each tool call. */
function nextSourceHint(successfulEvidenceTools) {
  if (successfulEvidenceTools.size === 0) {
    return "I will choose another source before synthesizing.";
  }
  return "I will decide whether another source is needed or whether the evidence is enough to synthesize.";
}

/** Converts a raw tool result into a visible ReAct-style observation. */
function buildToolObservation(toolName, result, successfulEvidenceTools) {
  const parsed = result.parsed ?? safeJsonParse(result.content);
  const hint = nextSourceHint(successfulEvidenceTools);

  if (!result.ok) {
    const reason =
      parsed && typeof parsed === "object"
        ? parsed.message || parsed.error || "the tool returned an error"
        : "the tool returned an error";
    return `Observation: ${toolName} did not return usable evidence (${reason}). ${hint}`;
  }

  if (Array.isArray(parsed?.results)) {
    const count = parsed.results.length;
    const first = parsed.results[0];
    if (toolName === "googleDocs") {
      const title = first?.title ? `, including "${first.title}"` : "";
      return `Observation: I found ${count} internal document${count === 1 ? "" : "s"}${title}; I can use this as personal context if it relates to the milestone. ${hint}`;
    }
    if (toolName === "emailRead") {
      const subject = first?.subject ? `, including "${first.subject}"` : "";
      return `Observation: I found ${count} email thread${count === 1 ? "" : "s"}${subject}; this may reveal existing YC touchpoints or deadlines. ${hint}`;
    }
    if (toolName === "webSearch") {
      const source = first?.title ? `, led by "${first.title}"` : "";
      return `Observation: Web search returned ${count} current source${count === 1 ? "" : "s"}${source}; I can now verify the most relevant one directly. ${hint}`;
    }
    return `Observation: ${toolName} returned ${count} result${count === 1 ? "" : "s"}. ${hint}`;
  }

  if (toolName === "browserUse") {
    const url = parsed?.url ? ` from ${parsed.url}` : "";
    return `Observation: Browser verification returned page-level evidence${url}, so the final todos can be grounded in a checked source. ${hint}`;
  }

  if (toolName === "emailWrite") {
    return `Observation: The outreach draft action completed, so I can include follow-up work if it supports the milestone. ${hint}`;
  }

  return `Observation: ${toolName} completed and added context to the research session. ${hint}`;
}

/**
 * Keep model context small.
 * The UI can display the full response, but the planner only needs compact evidence.
 */
function compactToolOutputForModel(toolName, parsed) {
  if (typeof parsed === "string") return parsed.slice(0, 4000);
  if (!parsed || typeof parsed !== "object") return JSON.stringify(parsed);

  if (hasToolError(parsed)) {
    return JSON.stringify({
      error: parsed.error,
      message: parsed.message,
      results: parsed.results || [],
    });
  }

  if (Array.isArray(parsed.results)) {
    return JSON.stringify({
      ...parsed,
      results: parsed.results.slice(0, 5).map((item) => ({
        ...item,
        snippet: item.snippet ? String(item.snippet).slice(0, 900) : item.snippet,
      })),
    });
  }

  if (toolName === "browserUse") {
    return JSON.stringify({
      task: parsed.task,
      url: parsed.url,
      summary: parsed.summary,
      screenshots: parsed.screenshots || parsed.screenshot_urls || [],
      pageText: parsed.pageText ? String(parsed.pageText).slice(0, 1200) : "",
    });
  }

  return JSON.stringify(parsed).slice(0, 4000);
}

/** Rebuild the useful research transcript for the final synthesis model. */
function buildConversationForSummary(messages) {
  return messages
    .map((m) => {
      if (m instanceof SystemMessage) return null;
      if (m instanceof HumanMessage) {
        const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        if (content.startsWith("You still need to call:")) return null;
        return `User request:\n${content}`;
      }
      if (m instanceof ToolMessage) {
        return `Tool result [${m.name}]:\n${String(m.content).slice(0, 2500)}`;
      }
      const toolCalls = m.tool_calls || [];
      if (toolCalls.length > 0) {
        return `Agent called tools: ${toolCalls.map((tc) => tc.name).join(", ")}`;
      }
      const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      return content ? `Agent reasoning:\n${content}` : null;
    })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Final synthesis step.
 * The planner gathers evidence; this model turns that evidence into proposed todos.
 */
async function synthesizeProposals(messages) {
  const summarizerModel = createSummarizerModel();
  const conversationText = buildConversationForSummary(messages);

  const summaryPrompt = `You are a synthesis assistant. Below is the full research session where an AI agent investigated a user's milestone using real tools.

Your job: extract 3-5 concrete, immediately actionable proposed todos based ONLY on what the tools actually found. Do NOT invent sources. Cite real doc titles, email subjects, or URLs from the tool results.

Return ONLY valid JSON (no markdown fences, no extra text):
{
  "proposals": [
    {
      "title": "Specific action title (max 10 words)",
      "rationale": "Why this action matters, citing the real source that revealed it",
      "estimatedMinutes": 30,
      "energyCost": "low|medium|high",
      "priority": 1,
      "sources": ["exact doc/email subject/URL from tool results"]
    }
  ],
  "summary": "2-3 sentences: what was actually found and why these proposals are the right next steps"
}

Research session:
${conversationText}`;

  const response = await summarizerModel.invoke([new HumanMessage(summaryPrompt)]);
  const raw = typeof response.content === "string" ? response.content.trim() : JSON.stringify(response.content);
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [],
      summary: parsed.summary || "",
    };
  } catch {
    return { proposals: [], summary: raw.slice(0, 500) };
  }
}

/**
 * Execute one model-requested tool call.
 * Also streams both the call parameters and the result back to the UI trace.
 */
async function invokeTool(toolCall, onEvent, toolsByName) {
  const tool = toolsByName.get(toolCall.name);
  const args = toolCall.args || {};

  // Show exactly what tool was called and with what arguments.
  await onEvent("tool_call", {
    id: toolCall.id,
    tool: toolCall.name,
    args,
  });

  if (!tool) {
    const output = {
      error: "UNKNOWN_TOOL",
      message: `Tool "${toolCall.name}" is not registered.`,
      results: [],
    };
    await onEvent("tool_result", {
      id: toolCall.id,
      tool: toolCall.name,
      summary: summarizeToolOutput(toolCall.name, output),
      output,
    });
    return { content: JSON.stringify(output), ok: false };
  }

  try {
    const raw = await tool.invoke(args);
    const parsed = safeJsonParse(raw);
    const summary = summarizeToolOutput(toolCall.name, parsed);
    const content = compactToolOutputForModel(toolCall.name, parsed);

    // The frontend shows summary by default and keeps output collapsible.
    await onEvent("tool_result", {
      id: toolCall.id,
      tool: toolCall.name,
      summary,
      output: parsed,
    });

    return { content, ok: !hasToolError(parsed), parsed };
  } catch (err) {
    const output = {
      error: "TOOL_EXCEPTION",
      message: err.message,
      results: [],
    };
    await onEvent("tool_result", {
      id: toolCall.id,
      tool: toolCall.name,
      summary: summarizeToolOutput(toolCall.name, output),
      output,
    });
    return { content: JSON.stringify(output), ok: false, parsed: output };
  }
}

/**
 * Main ReAct loop:
 * 1. Ask the planner what to do next.
 * 2. Run any tool calls it chooses.
 * 3. Feed tool results back as ToolMessages.
 * 4. Stop once enough evidence exists, then synthesize proposed todos.
 */
export async function runResearchAgent(goal, runId, onEvent) {
  // Tools are built per run so streaming/browser events stay scoped to this run.
  const tools = buildTools(onEvent);
  const toolsByName = new Map(tools.map((t) => [t.name, t]));
  const plannerModel = createPlannerModel(tools);
  const expectedTools = expectedToolsForGoal(goal);

  // Conversation memory for the planner: system rules, user milestone, tool observations.
  const messages = [
    new SystemMessage(RESEARCH_SYSTEM),
    new HumanMessage(researchUserPrompt({ goal })),
  ];

  // Evidence tools are the sources used to ground final proposals.
  const successfulEvidenceTools = new Set();
  const attemptedEvidenceTools = new Set();

  await onEvent("thought", {
    text: `Starting research on: "${goal.title}". I will show each tool call, its parameters, and a collapsible response as the work runs.`,
  });

  for (let step = 0; step < MAX_PLANNER_STEPS; step += 1) {
    // If a source looks relevant but has not been attempted, remind the planner before it finishes.
    const unattemptedExpectedTools = Array.from(expectedTools).filter(
      (name) => !attemptedEvidenceTools.has(name)
    );
    const plannerInput =
      successfulEvidenceTools.size === 0 && step > 0
        ? [
            ...messages,
            new HumanMessage(
              "You do not have a successful evidence source yet. Choose the best next source or tool now; do not finish until at least one source returns usable evidence."
            ),
          ]
        : successfulEvidenceTools.size > 0 && unattemptedExpectedTools.length > 0
          ? [
              ...messages,
              new HumanMessage(
                `Before finishing, decide whether these likely-relevant sources should be checked: ${unattemptedExpectedTools.join(", ")}. ` +
                  "If they are relevant, call the best next one. If they are not needed, briefly explain why and say RESEARCH COMPLETE."
              ),
            ]
        : messages;

    // Planner either returns natural-language reasoning, tool calls, or "RESEARCH COMPLETE".
    const response = await plannerModel.invoke(plannerInput);
    messages.push(response);

    const toolCalls = response.tool_calls || [];
    const responseText = typeof response.content === "string" ? response.content.trim() : "";

    if (responseText && !responseText.includes("RESEARCH COMPLETE")) {
      await onEvent("thought", { text: responseText });
    }

    if (toolCalls.length === 0) {
      if (responseText.includes("RESEARCH COMPLETE") && successfulEvidenceTools.size > 0) break;
      if (successfulEvidenceTools.size > 0) break;
      continue;
    }

    for (const toolCall of toolCalls) {
      if (EVIDENCE_TOOL_NAMES.includes(toolCall.name)) {
        attemptedEvidenceTools.add(toolCall.name);
      }

      const result = await invokeTool(toolCall, onEvent, toolsByName);

      // Feeding the result back as a ToolMessage is what lets the model observe and continue.
      messages.push(
        new ToolMessage({
          content: asToolContent(result.content),
          tool_call_id: toolCall.id,
          name: toolCall.name,
        })
      );

      if (result.ok && EVIDENCE_TOOL_NAMES.includes(toolCall.name)) {
        successfulEvidenceTools.add(toolCall.name);
      }

      // Visible observation makes the trace readable without exposing hidden chain-of-thought.
      await onEvent("thought", {
        text: buildToolObservation(toolCall.name, result, successfulEvidenceTools),
      });
    }
  }

  if (successfulEvidenceTools.size === 0) {
    throw new Error("Research could not complete. No source returned usable evidence.");
  }

  // Only synthesize after at least one real evidence source succeeded.
  await onEvent("thought", {
    text: `Research evidence collected from ${Array.from(successfulEvidenceTools).join(", ")}. Synthesizing proposals now.`,
  });

  const { proposals, summary } = await synthesizeProposals(messages);
  return { proposals, summary };
}
