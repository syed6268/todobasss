import { Router } from "express";
import { config } from "../config/env.js";
import { findFreeSlots } from "../utils/freeSlots.js";
import { formatMinutes } from "../utils/time.js";
import { orchestrateDay } from "../agents/orchestrator/OrchestratorAgent.js";
import { persistAndEnrichSchedule } from "../agents/orchestrator/persistSchedule.js";
import { fetchEventsForDate, isAuthenticated } from "../services/gcal.service.js";

const router = Router();

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

router.post("/generate", async (req, res) => {
  try {
    const {
      calendarEvents: bodyEvents = [],
      useGCal = false,
      date = null,
    } = req.body || {};

    const targetDate = date || todayKey();
    const isToday = targetDate === todayKey();

    let calendarEvents = bodyEvents;
    let source = "manual";

    if (useGCal) {
      if (!isAuthenticated()) {
        return res.status(401).json({
          error: "Not authenticated with Google Calendar",
          connectUrl: "/api/auth/google",
        });
      }
      try {
        calendarEvents = await fetchEventsForDate(targetDate);
        source = "gcal";
      } catch (err) {
        return res.status(500).json({
          error: "Failed to fetch Google Calendar events",
          message: err.message,
        });
      }
    }

    // If scheduling today, skip slots that have already passed (add 5-min buffer).
    let minStartMinutes = null;
    if (isToday) {
      const now = new Date();
      minStartMinutes = now.getHours() * 60 + now.getMinutes() + 5;
    }

    const rawFreeSlots = findFreeSlots(calendarEvents, {
      dayStartHour: config.schedule.dayStartHour,
      dayEndHour: config.schedule.dayEndHour,
      minStartMinutes,
    });

    const freeSlots = rawFreeSlots.map((s) => ({
      ...s,
      startLabel: formatMinutes(s.start),
      endLabel: formatMinutes(s.end),
    }));

    const result = await orchestrateDay({ calendarEvents, freeSlots });
    const enrichedSchedule = await persistAndEnrichSchedule(result.schedule);

    res.json({
      source,
      date: targetDate,
      schedule: enrichedSchedule,
      summary: result.summary,
      stats: result.stats,
      deferred: result.deferred,
      proposals: result.proposals,
      recentLoad: result.recentLoad,
      activeGoals: result.activeGoals,
      calendarEvents,
      freeSlots,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error generating schedule:", err);
    res.status(500).json({ error: "Failed to generate schedule", message: err.message });
  }
});

export default router;
