import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { config } from "../../../config/env.js";

/**
 * Search the web using Tavily's search API.
 * Returns top results with title, URL, and content snippet.
 */
export const webSearchTool = tool(
  async ({ query, maxResults = 5 }) => {
    if (!config.tavily.apiKey) {
      throw new Error("TAVILY_API_KEY not configured. See backend/.env.research.example");
    }

    let response;
    try {
      response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: config.tavily.apiKey,
          query,
          max_results: maxResults,
          include_answer: true,
          include_raw_content: false,
        }),
      });
    } catch (err) {
      return JSON.stringify({ error: "NETWORK_ERROR", message: `Could not reach Tavily: ${err.message}`, results: [] });
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return JSON.stringify({ error: "TAVILY_ERROR", message: `Tavily returned ${response.status}: ${errText}`, results: [] });
    }

    const data = await response.json();
    const results = (data.results || []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content?.slice(0, 400) || "",
      score: r.score,
    }));

    return JSON.stringify({ query, answer: data.answer || null, results });
  },
  {
    name: "webSearch",
    description:
      "Search the web for current, real-time information relevant to the milestone. Use this to find job listings, industry trends, learning resources, competitor info, tutorial articles, or any external information needed to plan next steps.",
    schema: z.object({
      query: z.string().describe("Search query — be specific and include relevant context for better results"),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Number of search results to return (1–10, default 5)"),
    }),
  }
);
