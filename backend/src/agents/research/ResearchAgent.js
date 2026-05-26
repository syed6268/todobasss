import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { StateGraph, MessagesAnnotation, MemorySaver, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";

import { config } from "../../config/env.js";
import { RESEARCH_SYSTEM, researchUserPrompt } from "./prompts.js";
import { googleDocsTool } from "./tools/googleDocs.tool.js";
import { emailReadTool } from "./tools/emailRead.tool.js";
import { emailWriteTool } from "./tools/emailWrite.tool.js";
import { webSearchTool } from "./tools/webSearch.tool.js";
import { browserUseTool } from "./tools/browserUse.tool.js";

const TOOLS = [googleDocsTool, emailReadTool, emailWriteTool, webSearchTool, browserUseTool];

// Required tools the model must call at least once before it can finish
const REQUIRED_TOOL_NAMES = ["googleDocs", "emailRead", "webSearch", "browserUse"];

/**
 * Count how many distinct tool names from the required set have been called
 * at least once in the current message history.
 */
function countCalledRequiredTools(messages) {
  const called = new Set();
  for (const m of messages) {
    if (m instanceof AIMessage && m.tool_calls) {
      for (const tc of m.tool_calls) {
        if (REQUIRED_TOOL_NAMES.includes(tc.name)) called.add(tc.name);
      }
    }
  }
  return called.size;
}

function buildGraph() {
  // Planner model — temperature 0 for consistent tool selection
  const model = new ChatOpenAI({
    apiKey: config.openai.apiKey,
    model: "gpt-4o-mini",   // hard-coded to avoid gpt-3.5-turbo fallback
    temperature: 0,
  }).bindTools(TOOLS);

  // Separate summarizer model — no tools, just synthesis
  const summarizerModel = new ChatOpenAI({
    apiKey: config.openai.apiKey,
    model: "gpt-4o-mini",
    temperature: 0.3,
  });

  const rawToolNode = new ToolNode(TOOLS);

  /**
   * Safe wrapper: guarantees a ToolMessage for every tool_call_id in the last
   * AIMessage, even when a tool throws or ToolNode itself throws.
   * Without this, an unhandled error leaves an AIMessage with tool_calls
   * unanswered, and OpenAI returns 400 on the next planner call.
   */
  async function safeToolsNode(state) {
    const lastAI = state.messages[state.messages.length - 1];
    const toolCalls = (lastAI instanceof AIMessage && lastAI.tool_calls) ? lastAI.tool_calls : [];

    try {
      return await rawToolNode.invoke(state);
    } catch (err) {
      // ToolNode itself threw — build error ToolMessages for every pending call
      const errorMessages = toolCalls.map(
        (tc) =>
          new ToolMessage({
            content: JSON.stringify({ error: err.message, tool: tc.name }),
            tool_call_id: tc.id,
            name: tc.name,
          })
      );
      return { messages: errorMessages };
    }
  }

  // Planner node
  async function plannerNode(state) {
    const calledCount = countCalledRequiredTools(state.messages);

    // If required tools haven't been called yet, inject a reminder so the model
    // doesn't short-circuit to summarizer before doing real research.
    let messages = state.messages;
    if (calledCount < REQUIRED_TOOL_NAMES.length) {
      const remaining = REQUIRED_TOOL_NAMES.filter(
        (t) => !state.messages.some(
          (m) => m instanceof AIMessage && m.tool_calls?.some((tc) => tc.name === t)
        )
      );
      // Append a gentle system reminder only when the model is about to give up early
      const lastAI = [...state.messages].reverse().find((m) => m instanceof AIMessage);
      const lastHasNoTools = lastAI && (!lastAI.tool_calls || lastAI.tool_calls.length === 0);
      if (lastAI && lastHasNoTools && calledCount < REQUIRED_TOOL_NAMES.length) {
        messages = [
          ...state.messages,
          new HumanMessage(
            `You still need to call: ${remaining.join(", ")}. ` +
            `Do NOT finish until all required tools have been used. Call the next required tool now.`
          ),
        ];
      }
    }

    const response = await model.invoke(messages);
    return { messages: [response] };
  }

  /**
   * Decide next step:
   * - If model called tools → run them
   * - If all required tools called OR model said RESEARCH COMPLETE → summarize
   * - Otherwise → loop back to planner with a reminder injected above
   */
  function shouldContinue(state) {
    const last = state.messages[state.messages.length - 1];

    // Model wants to call tools
    if (last instanceof AIMessage && last.tool_calls && last.tool_calls.length > 0) {
      return "tools";
    }

    // Model finished with text — check if it hit "RESEARCH COMPLETE" or called all required tools
    const calledCount = countCalledRequiredTools(state.messages);
    const content = typeof last?.content === "string" ? last.content : "";
    const declaredDone = content.includes("RESEARCH COMPLETE");
    const calledAllRequired = calledCount >= REQUIRED_TOOL_NAMES.length;

    if (declaredDone || calledAllRequired) {
      return "summarizer";
    }

    // Not done yet — loop back so plannerNode can inject a reminder
    return "planner";
  }

  // Summarizer node: synthesize all tool results into proposals JSON
  async function summarizerNode(state) {
    const conversationText = state.messages
      .map((m) => {
        if (m instanceof SystemMessage) return null;
        if (m instanceof HumanMessage) {
          const c = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
          // Skip injected reminder messages from the loop
          if (c.startsWith("You still need to call:")) return null;
          return `User request: ${c}`;
        }
        if (m instanceof AIMessage) {
          const text = m.content || "[called tools]";
          const toolNames = m.tool_calls?.map((tc) => tc.name).join(", ");
          return toolNames
            ? `Agent decided to call: ${toolNames}`
            : `Agent reasoning: ${text}`;
        }
        if (m instanceof ToolMessage) {
          const raw = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
          const trimmed = raw.slice(0, 2000);
          return `Tool result [${m.name}]:\n${trimmed}`;
        }
        return null;
      })
      .filter(Boolean)
      .join("\n\n");

    const summaryPrompt = `You are a synthesis assistant. Below is the full research session where an AI agent investigated a user's milestone using real tools (Google Docs, Gmail, web search, browser).

Your job: extract 3–5 concrete, immediately actionable proposed todos based ONLY on what the tools actually found. Do NOT invent sources. Cite real doc titles, email subjects, or URLs from the tool results.

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
  "summary": "2–3 sentences: what was actually found and why these proposals are the right next steps"
}

Research session:
${conversationText}`;

    const response = await summarizerModel.invoke([new HumanMessage(summaryPrompt)]);
    return { messages: [response] };
  }

  const checkpointer = new MemorySaver();

  const graph = new StateGraph(MessagesAnnotation)
    .addNode("planner", plannerNode)
    .addNode("tools", safeToolsNode)
    .addNode("summarizer", summarizerNode)
    .addEdge(START, "planner")
    .addConditionalEdges("planner", shouldContinue, {
      tools: "tools",
      summarizer: "summarizer",
      planner: "planner",
    })
    .addEdge("tools", "planner")
    .addEdge("summarizer", END)
    .compile({ checkpointer });

  return graph;
}

// Singleton compiled graph
let _graph = null;
function getGraph() {
  if (!_graph) _graph = buildGraph();
  return _graph;
}

/**
 * Run the research agent and stream structured trace events via onEvent callback.
 */
export async function runResearchAgent(goal, runId, onEvent) {
  const graph = getGraph();

  // Emit a status event immediately so the trace panel isn't blank while waiting
  await onEvent("thought", { text: `Starting research on: "${goal.title}". Will search Google Docs, Gmail, web, and browser in sequence.` });

  const input = {
    messages: [
      new SystemMessage(RESEARCH_SYSTEM),
      new HumanMessage(researchUserPrompt({ goal })),
    ],
  };

  const streamConfig = {
    configurable: { thread_id: String(runId) },
    version: "v2",
  };

  let proposals = [];
  let summary = "";

  // Accumulate planner text tokens into readable thought bubbles
  let thoughtBuffer = "";
  let lastFlushAt = Date.now();

  const flushThought = async () => {
    const text = thoughtBuffer.trim();
    if (text) await onEvent("thought", { text });
    thoughtBuffer = "";
  };

  // Track which tools have been called so we can emit a trace step label
  const toolCallsEmitted = new Set();

  for await (const event of graph.streamEvents(input, streamConfig)) {
    const { event: evtType, name, data, metadata } = event;
    const graphNode = metadata?.langgraph_node;

    // ── Planner text tokens → accumulate into thought bubble ────────────────
    if (evtType === "on_chat_model_stream" && graphNode === "planner") {
      const content = data?.chunk?.content;
      if (content && typeof content === "string") {
        thoughtBuffer += content;
        const now = Date.now();
        if (
          thoughtBuffer.length > 300 ||
          /[.!?\n]/.test(content) ||
          now - lastFlushAt > 1500
        ) {
          await flushThought();
          lastFlushAt = now;
        }
      }
    }

    // Flush remaining thought when planner finishes one response
    if (evtType === "on_chat_model_end" && graphNode === "planner") {
      await flushThought();

      // If the planner response contains tool_calls but no text, emit a status thought
      const aiMsg = data?.output;
      const hasCalls = aiMsg?.tool_calls?.length > 0;
      const hasText = aiMsg?.content && String(aiMsg.content).trim().length > 0;
      if (hasCalls && !hasText) {
        const toolNames = aiMsg.tool_calls.map((tc) => tc.name).join(", ");
        await onEvent("thought", { text: `Calling tool${aiMsg.tool_calls.length > 1 ? "s" : ""}: ${toolNames}` });
      }
    }

    // ── Tool invoked ──────────────────────────────────────────────────────────
    if (evtType === "on_tool_start") {
      await flushThought();
      await onEvent("tool_call", {
        tool: name,
        args: data?.input || {},
      });
    }

    // ── Tool returned ─────────────────────────────────────────────────────────
    if (evtType === "on_tool_end") {
      let output = data?.output;
      if (typeof output === "string") {
        try { output = JSON.parse(output); } catch { /* keep as string */ }
      }
      await onEvent("tool_result", {
        tool: name,
        output,
      });
    }

    // ── Summarizer finished → extract proposals JSON ──────────────────────────
    if (evtType === "on_chat_model_end" && graphNode === "summarizer") {
      const raw = data?.output?.content ?? "";
      const text = typeof raw === "string" ? raw.trim() : JSON.stringify(raw);
      // Strip markdown code fences if model wraps JSON in ```json ... ```
      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      try {
        const parsed = JSON.parse(cleaned);
        proposals = Array.isArray(parsed.proposals) ? parsed.proposals : [];
        summary = parsed.summary || "";
      } catch {
        summary = text.slice(0, 500);
      }
    }
  }

  if (proposals.length > 0) {
    await onEvent("proposals", { proposals, summary });
  }

  return { proposals, summary };
}
