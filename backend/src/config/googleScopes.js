/**
 * Canonical list of Google OAuth scopes used across the whole backend.
 * Kept here so gcal.service.js, research tools, and auth.routes.js all
 * request / assert the same set in one place.
 *
 * To add a scope: append it here, then have users Disconnect + Reconnect
 * in the app so Google mints a new token covering the extended set.
 */
export const GOOGLE_SCOPES = [
  // Calendar — read + write events
  "https://www.googleapis.com/auth/calendar.events",

  // Gmail — read inbox
  "https://www.googleapis.com/auth/gmail.readonly",

  // Gmail — send / draft
  "https://www.googleapis.com/auth/gmail.send",

  // Google Docs — read document content
  "https://www.googleapis.com/auth/documents.readonly",

  // Google Drive — list + read files (needed to search Docs by query)
  "https://www.googleapis.com/auth/drive.readonly",
];
