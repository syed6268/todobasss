import { Router } from "express";
import {
  fetchEventsForDate,
  insertScheduleIntoCalendar,
  isAuthenticated,
} from "../services/gcal.service.js";

const router = Router();

router.get("/events/today", async (req, res) => {
  if (!isAuthenticated()) {
    return res.status(401).json({
      error: "Not authenticated with Google Calendar",
      connectUrl: "/api/auth/google",
    });
  }

  const date = req.query.date || null;

  try {
    const events = await fetchEventsForDate(date);
    res.json({ events, count: events.length, date });
  } catch (err) {
    console.error("GCal fetch error:", err);
    res.status(500).json({ error: "Failed to fetch calendar events", message: err.message });
  }
});

router.post("/events/push-schedule", async (req, res) => {
  if (!isAuthenticated()) {
    return res.status(401).json({
      error: "Not authenticated with Google Calendar",
      connectUrl: "/api/auth/google",
    });
  }

  const { schedule = [], date = null } = req.body || {};
  if (!Array.isArray(schedule) || schedule.length === 0) {
    return res.status(400).json({ error: "schedule array is required" });
  }

  try {
    const result = await insertScheduleIntoCalendar(schedule, date);

    const needsReconnect = (result.results || []).some(
      (r) =>
        !r.success &&
        (r.status === 401 ||
          r.status === 403 ||
          /insufficient|scope|permission|invalid_grant/i.test(r.error || ""))
    );

    res.json({ ...result, needsReconnect });
  } catch (err) {
    const googleMsg =
      err?.response?.data?.error?.message || err?.message || "Unknown error";
    const status = err?.response?.status || err?.code;
    console.error("GCal push error:", { status, googleMsg, body: err?.response?.data });
    res.status(500).json({
      error: "Failed to insert events into Google Calendar",
      message: googleMsg,
      status,
      needsReconnect:
        status === 401 ||
        status === 403 ||
        /insufficient|scope|permission|invalid_grant/i.test(googleMsg),
    });
  }
});

export default router;
