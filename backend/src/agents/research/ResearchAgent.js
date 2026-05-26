import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";

import { config } from "../../config/env.js";
import { RESEARCH_SYSTEM, researchUserPrompt } from "./prompts.js";
import { googleDocsTool } from "./tools/googleDocs.tool.js";
import { emailReadTool } from "./tools/emailRead.tool.js";
import { emailWriteTool } from "./tools/emailWrite.tool.js";
import { webSearchTool } from "./tools/webSearch.tool.js";
import { createBrowserUseTool } from "./tools/browserUse.tool.js";

// REQUIRED_TOOL_NAMES used for planner reminders.
// Only webSearch is a hard requirement — others are gracefully degraded.
const REQUIRED_TOOL_NAMES = ["googleDocs", "emailRead", "webSearch", "browserUse"];
const HARD_REQUIRED_TOOL_NAMES = ["webSearch"];
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

async function invokeTool(toolCall, onEvent, toolsByName) {
  const tool = toolsByName.get(toolCall.name);
  const args = toolCall.args || {};

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
 * Run the research agent and stream structured trace events via onEvent callback.
 */
export async function runResearchAgent(goal, runId, onEvent) {
  const tools = buildTools(onEvent);
  const toolsByName = new Map(tools.map((t) => [t.name, t]));
  const plannerModel = createPlannerModel(tools);
  const messages = [
    new SystemMessage(RESEARCH_SYSTEM),
    new HumanMessage(researchUserPrompt({ goal })),
  ];
  const successfulRequiredTools = new Set();

  await onEvent("thought", {
    text: `Starting research on: "${goal.title}". I will show each tool call, its parameters, and a collapsible response as the work runs.`,
  });

  for (let step = 0; step < MAX_PLANNER_STEPS; step += 1) {
    const remaining = REQUIRED_TOOL_NAMES.filter((name) => !successfulRequiredTools.has(name));
    const plannerInput =
      remaining.length > 0 && step > 0
        ? [
            ...messages,
            new HumanMessage(
              `You still need successful results from: ${remaining.join(", ")}. ` +
                "Call the next useful required tool now. Do not finish yet."
            ),
          ]
        : messages;

    const response = await plannerModel.invoke(plannerInput);
    messages.push(response);

    const toolCalls = response.tool_calls || [];
    const responseText = typeof response.content === "string" ? response.content.trim() : "";

    if (responseText && !responseText.includes("RESEARCH COMPLETE")) {
      await onEvent("thought", { text: responseText });
    }

    if (toolCalls.length === 0) {
      if (remaining.length === 0 || responseText.includes("RESEARCH COMPLETE")) break;
      continue;
    }

    for (const toolCall of toolCalls) {
      const result = await invokeTool(toolCall, onEvent, toolsByName);
      messages.push(
        new ToolMessage({
          content: asToolContent(result.content),
          tool_call_id: toolCall.id,
          name: toolCall.name,
        })
      );

      if (result.ok && REQUIRED_TOOL_NAMES.includes(toolCall.name)) {
        successfulRequiredTools.add(toolCall.name);
      }
    }

    if (REQUIRED_TOOL_NAMES.every((name) => successfulRequiredTools.has(name))) {
      await onEvent("thought", { text: "Required research tools completed. Synthesizing proposals." });
      break;
    }
  }

  // Hard-fail only if core search tools never returned results
  const hardMissing = HARD_REQUIRED_TOOL_NAMES.filter((name) => !successfulRequiredTools.has(name));
  if (hardMissing.length > 0) {
    throw new Error(`Research could not complete. Missing core tool results: ${hardMissing.join(", ")}`);
  }

  // Soft-warn for optional tools (googleDocs, emailRead, browserUse) — still synthesize
  const softMissing = REQUIRED_TOOL_NAMES.filter(
    (name) => !HARD_REQUIRED_TOOL_NAMES.includes(name) && !successfulRequiredTools.has(name)
  );
  if (softMissing.length > 0) {
    await onEvent("thought", {
      text: `Note: ${softMissing.join(", ")} did not return successful results. Generating proposals from available research data.`,
    });
  }

  const { proposals, summary } = await synthesizeProposals(messages);
  return { proposals, summary };
}
