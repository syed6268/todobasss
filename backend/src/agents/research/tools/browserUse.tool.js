import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { config } from "../../../config/env.js";

const BASE_URL = () => config.browserUse.apiUrl.replace(/\/$/, "");
const HEADERS = () => ({
  "Content-Type": "application/json",
  "X-Browser-Use-API-Key": config.browserUse.apiKey,
});

/**
 * Polls for session completion while streaming intermediate messages to onEvent.
 * v3 terminal statuses: "idle" | "stopped" | "error" | "timed_out"
 */
async function pollSessionWithStream(sessionId, onEvent, timeoutMs = 180_000) {
  const start = Date.now();
  let lastMessageId = undefined;

  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 3000));

    // Stream intermediate agent messages (best-effort — don't abort on failure)
    try {
      // Stream browser progress into the research trace while the remote session runs.
      const msgUrl = new URL(`${BASE_URL()}/sessions/${sessionId}/messages`);
      if (lastMessageId) msgUrl.searchParams.set("after", lastMessageId);
      msgUrl.searchParams.set("limit", "20");

      const msgRes = await fetch(msgUrl.toString(), { headers: HEADERS() });
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        const msgs = Array.isArray(msgData.messages)
          ? msgData.messages
          : Array.isArray(msgData.items)
            ? msgData.items
            : [];
        for (const m of msgs) {
          if (m.summary) {
            await onEvent("browser_step", {
              text: m.summary,
              role: m.role || "agent",
            });
          }
          if (m.id) lastMessageId = m.id;
        }
      }
    } catch {
      // message streaming is best-effort
    }

    // Check terminal status
    const res = await fetch(`${BASE_URL()}/sessions/${sessionId}`, {
      headers: HEADERS(),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Poll failed ${res.status}: ${errText}`);
    }
    const data = await res.json();

    if (data.status === "idle" || data.status === "stopped") return data;
    if (data.status === "error" || data.status === "timed_out") {
      throw new Error(`Browser task failed: ${data.output || data.status}`);
    }
  }
  throw new Error("Browser task timed out after 3 minutes.");
}

/**
 * Factory — call with onEvent so the tool can stream browser steps to the UI.
 * Used by ResearchAgent so each run gets a live-streaming tool instance.
 */
export function createBrowserUseTool(onEvent) {
  return tool(
    async ({ task, url }) => {
      // Browser verification source: checks live pages and can expose a live iframe URL.
      if (!config.browserUse.apiUrl || !config.browserUse.apiKey) {
        return JSON.stringify({
          error: "BROWSER_USE_NOT_CONFIGURED",
          message:
            "BROWSER_USE_API_URL / BROWSER_USE_API_KEY not set. See backend/.env.research.example",
          summary: "",
          screenshots: [],
        });
      }

      const taskWithUrl = url ? `${task}\nStart URL: ${url}` : task;
      const payload = { task: taskWithUrl };

      let createRes;
      try {
        createRes = await fetch(`${BASE_URL()}/sessions`, {
          method: "POST",
          headers: HEADERS(),
          body: JSON.stringify(payload),
        });
      } catch (err) {
        return JSON.stringify({
          error: "NETWORK_ERROR",
          message: `Could not reach browser-use API: ${err.message}`,
          summary: "",
          screenshots: [],
        });
      }

      if (!createRes.ok) {
        const errText = await createRes.text().catch(() => "");
        return JSON.stringify({
          error: "BROWSER_USE_ERROR",
          message: `browser-use API returned ${createRes.status}: ${errText}`,
          summary: "",
          screenshots: [],
        });
      }

      let session;
      try {
        session = await createRes.json();
      } catch (err) {
        return JSON.stringify({
          error: "PARSE_ERROR",
          message: "browser-use API returned non-JSON",
          summary: "",
          screenshots: [],
        });
      }

      const sessionId = session.id || session.session_id;
      if (!sessionId) {
        return JSON.stringify({
          error: "NO_SESSION_ID",
          message: `No session id in response: ${JSON.stringify(session)}`,
          summary: "",
          screenshots: [],
        });
      }

      // Emit live URL so frontend can embed the browser iframe
      const liveUrl = session.live_url || session.liveUrl;
      if (liveUrl) {
        await onEvent("browser_live_url", { url: liveUrl });
      }

      await onEvent("thought", {
        text: `Browser session started (id: ${sessionId}). Running: "${task.slice(0, 80)}${task.length > 80 ? "…" : ""}"`,
      });

      let finished;
      try {
        finished = await pollSessionWithStream(sessionId, onEvent);
      } catch (err) {
        return JSON.stringify({
          error: "BROWSER_USE_ERROR",
          message: err.message,
          summary: "",
          screenshots: [],
        });
      }

      return JSON.stringify({
        task,
        url: url || null,
        summary: finished.output || finished.result || "Browser task completed.",
        screenshots: finished.screenshots || finished.screenshot_urls || [],
        pageText: String(finished.page_text || "").slice(0, 1000),
      });
    },
    {
      name: "browserUse",
      description:
        "Automate a browser task: visit a URL, perform brand analysis, take screenshots, extract page content, or interact with web pages that require JavaScript rendering.",
      schema: z.object({
        task: z
          .string()
          .describe("Natural-language description of what to do in the browser"),
        url: z
          .string()
          .url()
          .optional()
          .describe("Optional starting URL"),
      }),
    }
  );
}

// Backward-compatible default export (no streaming) so other imports don't break.
export const browserUseTool = createBrowserUseTool(async () => {});
