import { google } from "googleapis";
import { config, assertGoogleOAuth } from "../config/env.js";
import { getStoredTokens, saveTokens } from "../data/tokenStore.js";
import { parseTimeRangeToTodayISO } from "../utils/scheduleTime.js";
import { GOOGLE_SCOPES } from "../config/googleScopes.js";

export function createOAuthClient() {
  assertGoogleOAuth();
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
  );
}

export function getAuthUrl() {
  const oAuth2Client = createOAuthClient();
  return oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
  });
}

export async function exchangeCodeForTokens(code) {
  const oAuth2Client = createOAuthClient();
  const { tokens } = await oAuth2Client.getToken(code);
  saveTokens(tokens);
  return tokens;
}

export function getAuthenticatedClient() {
  const oAuth2Client = createOAuthClient();
  const stored = getStoredTokens();

  if (stored) {
    oAuth2Client.setCredentials(stored);
    return oAuth2Client;
  }

  if (config.google.refreshToken) {
    oAuth2Client.setCredentials({ refresh_token: config.google.refreshToken });
    return oAuth2Client;
  }

  return null;
}

export function isAuthenticated() {
  return Boolean(getAuthenticatedClient());
}

/** Parse YYYY-MM-DD (or null = today) into a local-midnight Date. */
function parseLocalDate(dateStr) {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfDayISO(dateStr = null) {
  const d = parseLocalDate(dateStr);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfDayISO(dateStr = null) {
  const d = parseLocalDate(dateStr);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function formatTimeFromISO(iso) {
  const d = new Date(iso);
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const period = hours >= 12 ? "PM" : "AM";
  if (hours === 0) hours = 12;
  else if (hours > 12) hours -= 12;
  return `${hours}:${minutes.toString().padStart(2, "0")} ${period}`;
}

function getCalendarApi() {
  const auth = getAuthenticatedClient();
  if (!auth) {
    const err = new Error("Not authenticated with Google Calendar");
    err.code = "NOT_AUTHENTICATED";
    throw err;
  }
  return google.calendar({ version: "v3", auth });
}

/** Insert AI-scheduled slots into Google Calendar (skips calendar/free types). */
export async function insertScheduleIntoCalendar(scheduleItems, dateStr = null) {
  const calendar = getCalendarApi();
  const prefix = "[Todo10kr] ";

  const toInsert = (scheduleItems || []).filter(
    (s) => s && ["dump", "suggested", "break"].includes(s.type) && !s.gcalInserted
  );

  const results = [];

  for (const slot of toInsert) {
    let range;
    try {
      range = parseTimeRangeToTodayISO(slot.time, dateStr);
    } catch (err) {
      results.push({
        id: slot.id,
        task: slot.task,
        success: false,
        error: err.message,
      });
      continue;
    }

    const description = [
      slot.reason ? `Reason: ${slot.reason}` : null,
      slot.type ? `Type: ${slot.type}` : null,
      "Created by Todo10kr",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const created = await calendar.events.insert({
        calendarId: config.google.calendarId,
        requestBody: {
          summary: `${prefix}${slot.task}`,
          description,
          start: { dateTime: range.startISO },
          end: { dateTime: range.endISO },
        },
      });

      results.push({
        id: slot.id,
        task: slot.task,
        success: true,
        eventId: created.data.id,
        htmlLink: created.data.htmlLink,
      });
    } catch (err) {
      const googleMsg =
        err?.response?.data?.error?.message ||
        err?.errors?.[0]?.message ||
        err?.message ||
        "Unknown error";
      const status = err?.response?.status || err?.code;
      console.error("Calendar insert failed:", {
        task: slot.task,
        status,
        googleMsg,
        body: err?.response?.data,
      });
      results.push({
        id: slot.id,
        task: slot.task,
        success: false,
        status,
        error: googleMsg,
      });
    }
  }

  return {
    inserted: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

export async function fetchEventsForDate(dateStr = null) {
  const calendar = getCalendarApi();

  const response = await calendar.events.list({
    calendarId: config.google.calendarId,
    timeMin: startOfDayISO(dateStr),
    timeMax: endOfDayISO(dateStr),
    singleEvents: true,
    orderBy: "startTime",
  });

  const items = response.data.items || [];

  return items
    .filter((e) => e.start?.dateTime && e.end?.dateTime)
    .map((e) => ({
      id: e.id,
      title: e.summary || "(no title)",
      startTime: formatTimeFromISO(e.start.dateTime),
      endTime: formatTimeFromISO(e.end.dateTime),
      startISO: e.start.dateTime,
      endISO: e.end.dateTime,
      location: e.location || null,
      source: "gcal",
    }));
}

// Backwards-compat alias
export const fetchTodaysEvents = () => fetchEventsForDate(null);
