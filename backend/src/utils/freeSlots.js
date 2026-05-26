import { parseTimeString, formatMinutes } from "./time.js";

/**
 * Find free slots in a day.
 * @param {Array} calendarEvents
 * @param {Object} opts
 * @param {number} opts.dayStartHour
 * @param {number} opts.dayEndHour
 * @param {number|null} opts.minStartMinutes - earliest minute-of-day a slot can start
 *   (used to skip already-past time when scheduling today)
 */
export function findFreeSlots(
  calendarEvents,
  { dayStartHour = 8, dayEndHour = 22, minStartMinutes = null } = {}
) {
  const DAY_START = dayStartHour * 60;
  const DAY_END = dayEndHour * 60;
  const lowerBound =
    minStartMinutes != null ? Math.max(DAY_START, minStartMinutes) : DAY_START;

  const busy = (calendarEvents || [])
    .map((event) => ({
      start: parseTimeString(event.startTime),
      end: parseTimeString(event.endTime),
      title: event.title,
    }))
    .filter((e) => e.end > e.start)
    .sort((a, b) => a.start - b.start);

  const freeSlots = [];
  let cursor = lowerBound;

  for (const event of busy) {
    if (cursor < event.start) {
      freeSlots.push({
        start: cursor,
        end: Math.min(event.start, DAY_END),
        duration: Math.min(event.start, DAY_END) - cursor,
      });
    }
    cursor = Math.max(cursor, event.end);
    if (cursor >= DAY_END) break;
  }

  if (cursor < DAY_END) {
    freeSlots.push({ start: cursor, end: DAY_END, duration: DAY_END - cursor });
  }

  return freeSlots.filter((s) => s.duration > 0);
}

export function formatFreeSlots(freeSlots) {
  return freeSlots
    .map((s) => `${formatMinutes(s.start)} - ${formatMinutes(s.end)} (${s.duration} min)`)
    .join("\n");
}
