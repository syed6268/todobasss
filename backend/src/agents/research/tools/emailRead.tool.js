import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { google } from "googleapis";
import { getAuthenticatedClient } from "../../../services/gcal.service.js";

/**
 * Search Gmail inbox for emails matching a query and return their
 * metadata + snippet.
 */
export const emailReadTool = tool(
  async ({ query, max = 5 }) => {
    const auth = getAuthenticatedClient();
    if (!auth) {
      return JSON.stringify({ error: "NEEDS_RECONNECT", message: "Not authenticated with Google. The user needs to Connect Google in the app.", results: [] });
    }

    const gmail = google.gmail({ version: "v1", auth });

    let listRes;
    try {
      listRes = await gmail.users.messages.list({ userId: "me", q: query, maxResults: max });
    } catch (err) {
      const isAuth = err.message?.includes("invalid_grant") || err.code === 401;
      return JSON.stringify({
        error: isAuth ? "NEEDS_RECONNECT" : "GMAIL_ERROR",
        message: isAuth ? "Google token expired. The user needs to reconnect Google in the app." : err.message,
        results: [],
      });
    }

    const messages = listRes.data.messages || [];
    if (messages.length === 0) {
      return JSON.stringify({ results: [], message: `No emails found matching: "${query}"` });
    }

    const results = [];
    for (const msg of messages) {
      try {
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        });
        const headers = detail.data.payload?.headers || [];
        const get = (name) => headers.find((h) => h.name === name)?.value || "";
        results.push({
          id: msg.id,
          from: get("From"),
          to: get("To"),
          subject: get("Subject"),
          date: get("Date"),
          snippet: detail.data.snippet || "",
        });
      } catch {
        results.push({ id: msg.id, error: "Could not fetch email details" });
      }
    }

    return JSON.stringify({ results, query });
  },
  {
    name: "emailRead",
    description:
      "Search the user's Gmail inbox for emails related to a topic. Useful for finding recruiter contacts, past tutor conversations, subscriber feedback, or any email thread relevant to the milestone. Returns sender, subject, date, and a snippet of each matching email.",
    schema: z.object({
      query: z.string().describe("Gmail search query (supports Gmail operators like from:, subject:, after:, etc.)"),
      max: z.number().int().min(1).max(10).optional().describe("Maximum number of emails to return (1–10, default 5)"),
    }),
  }
);
