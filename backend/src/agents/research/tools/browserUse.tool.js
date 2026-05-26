import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { config } from "../../../config/env.js";

/**
 * Run a browser automation task via the user's browser-use API.
 * Returns a summary, page text, and screenshot URLs (if the API provides them).
 * Useful for brand analysis, competitor page screenshots, price comparisons,
 * reading behind-JS pages that plain fetch/scrape won't handle.
 */
export const browserUseTool = tool(
  async ({ task, url }) => {
    if (!config.browserUse.apiUrl || !config.browserUse.apiKey) {
      throw new Error(
        "BROWSER_USE_API_URL / BROWSER_USE_API_KEY not configured. See backend/.env.research.example"
      );
    }

    const endpoint = `${config.browserUse.apiUrl.replace(/\/$/, "")}/run`;

    const payload = { task };
    if (url) payload.url = url;

    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.browserUse.apiKey}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      return JSON.stringify({ error: "NETWORK_ERROR", message: `Could not reach browser-use API: ${err.message}`, summary: "", screenshots: [] });
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return JSON.stringify({ error: "BROWSER_USE_ERROR", message: `browser-use API returned ${response.status}: ${errText}`, summary: "", screenshots: [] });
    }

    let data;
    try {
      data = await response.json();
    } catch (err) {
      return JSON.stringify({ error: "PARSE_ERROR", message: "browser-use API returned non-JSON response", summary: "", screenshots: [] });
    }

    return JSON.stringify({
      task,
      url: url || null,
      summary: data.summary || data.result || "",
      screenshots: data.screenshots || data.screenshot_urls || [],
      pageText: (data.pageText || data.page_text || "").slice(0, 1000),
    });
  },
  {
    name: "browserUse",
    description:
      "Automate a browser task: visit a URL, perform brand analysis, take screenshots, extract page content, or interact with web pages that require JavaScript rendering. Use this to analyze competitor websites, job postings, pricing pages, or any site that needs actual browser rendering. Provide a clear natural-language task description.",
    schema: z.object({
      task: z
        .string()
        .describe(
          "Natural-language description of what to do in the browser (e.g. 'Visit the Stripe careers page, find senior backend engineer roles, and take a screenshot')"
        ),
      url: z
        .string()
        .url()
        .optional()
        .describe("Optional starting URL. If not provided, the browser will search/navigate based on the task."),
    }),
  }
);
