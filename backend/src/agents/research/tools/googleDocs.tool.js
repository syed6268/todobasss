import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { google } from "googleapis";
import { getAuthenticatedClient } from "../../../services/gcal.service.js";

/**
 * Search the user's Google Drive for Docs matching a query, then return
 * snippet text from the top matches.
 */
export const googleDocsTool = tool(
  async ({ query, maxDocs = 3 }) => {
    // Personal RAG source: searches the user's own docs for existing plans/lists/context.
    const auth = getAuthenticatedClient();
    if (!auth) {
      return JSON.stringify({ error: "NEEDS_RECONNECT", message: "Not authenticated with Google. The user needs to Connect Google Calendar in the app." });
    }

    const drive = google.drive({ version: "v3", auth });
    const docs = google.docs({ version: "v1", auth });

    // Search Drive for Google Docs containing the query text
    let listRes;
    try {
      listRes = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.document' and fullText contains '${query.replace(/'/g, "\\'")}'`,
        fields: "files(id,name,modifiedTime)",
        pageSize: maxDocs,
        orderBy: "modifiedTime desc",
      });
    } catch (err) {
      const isAuth = err.message?.includes("invalid_grant") || err.code === 401;
      return JSON.stringify({
        error: isAuth ? "NEEDS_RECONNECT" : "DRIVE_ERROR",
        message: isAuth
          ? "Google token expired. The user needs to reconnect Google in the app."
          : err.message,
        results: [],
      });
    }

    const files = listRes.data.files || [];
    if (files.length === 0) {
      return JSON.stringify({ results: [], message: `No Google Docs found matching: "${query}"` });
    }

    const results = [];
    for (const file of files) {
      try {
        const docRes = await docs.documents.get({ documentId: file.id });
        const doc = docRes.data;
        const text = extractDocText(doc);
        results.push({
          title: file.name,
          docId: file.id,
          modifiedTime: file.modifiedTime,
          snippet: text.slice(0, 800),
          charCount: text.length,
        });
      } catch {
        results.push({ title: file.name, docId: file.id, error: "Could not read document content" });
      }
    }

    return JSON.stringify({ results, query });
  },
  {
    name: "googleDocs",
    description:
      "Search the user's Google Drive for Google Docs related to a topic and return snippet text. Use this to find internal notes, drafts, resumes, vocab notebooks, or any personal documents relevant to the milestone.",
    schema: z.object({
      query: z.string().describe("Search query — keywords or phrases to find in document titles and content"),
      maxDocs: z.number().int().min(1).max(5).optional().describe("Maximum number of docs to return (1–5, default 3)"),
    }),
  }
);

function extractDocText(doc) {
  // Google Docs API returns a structural tree; flatten paragraphs and tables into text.
  const content = doc.body?.content || [];
  const parts = [];
  for (const element of content) {
    if (element.paragraph) {
      for (const pe of element.paragraph.elements || []) {
        if (pe.textRun?.content) parts.push(pe.textRun.content);
      }
    }
    if (element.table) {
      for (const row of element.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          for (const cp of cell.content || []) {
            if (cp.paragraph) {
              for (const pe of cp.paragraph.elements || []) {
                if (pe.textRun?.content) parts.push(pe.textRun.content);
              }
            }
          }
        }
      }
    }
  }
  return parts.join("").trim();
}
