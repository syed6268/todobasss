import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { google } from "googleapis";
import { getAuthenticatedClient } from "../../../services/gcal.service.js";
import { config } from "../../../config/env.js";

/**
 * Compose and either draft or send an email via Gmail.
 * Default mode is "draft" (safer). Set EMAIL_WRITER_MODE=send in .env to actually send.
 */
export const emailWriteTool = tool(
  async ({ to, subject, body, sendNow = false }) => {
    const auth = getAuthenticatedClient();
    if (!auth) {
      return JSON.stringify({ error: "NEEDS_RECONNECT", message: "Not authenticated with Google. The user needs to Connect Google in the app." });
    }

    const gmail = google.gmail({ version: "v1", auth });
    const shouldSend = sendNow && config.research.emailWriterMode === "send";
    const rawMessage = buildRawEmail({ to, subject, body });

    try {
      if (shouldSend) {
        const res = await gmail.users.messages.send({
          userId: "me",
          requestBody: { raw: rawMessage },
        });
        return JSON.stringify({ action: "sent", messageId: res.data.id, to, subject, note: "Email has been sent." });
      } else {
        const res = await gmail.users.drafts.create({
          userId: "me",
          requestBody: { message: { raw: rawMessage } },
        });
        return JSON.stringify({ action: "draft_created", draftId: res.data.id, to, subject, note: "Email saved as a Gmail draft. Open Gmail to review and send." });
      }
    } catch (err) {
      const isAuth = err.message?.includes("invalid_grant") || err.code === 401;
      return JSON.stringify({
        error: isAuth ? "NEEDS_RECONNECT" : "GMAIL_SEND_ERROR",
        message: isAuth ? "Google token expired. The user needs to reconnect Google in the app." : err.message,
      });
    }
  },
  {
    name: "emailWrite",
    description:
      "Compose an email and save it as a Gmail draft (or send it if send mode is enabled). Use this to write outreach emails, follow-ups, booking requests, or any email relevant to the milestone. By default this only creates a draft — the user reviews it in Gmail before sending.",
    schema: z.object({
      to: z.string().describe("Recipient email address (e.g. recruiter@company.com)"),
      subject: z.string().describe("Email subject line"),
      body: z.string().describe("Full email body text (plain text, not HTML)"),
      sendNow: z
        .boolean()
        .optional()
        .describe(
          "If true AND EMAIL_WRITER_MODE=send is set in backend .env, the email is sent immediately. Otherwise a draft is created."
        ),
    }),
  }
);

function buildRawEmail({ to, subject, body }) {
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body,
  ];
  const raw = lines.join("\r\n");
  // base64url encode
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
