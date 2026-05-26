import { parseTimeString } from "./time.js";

/** Parse "8:00 AM - 9:30 AM" into ISO strings for `dateStr` (YYYY-MM-DD) or today. */
export function parseTimeRangeToTodayISO(timeRange, dateStr = null) {
  if (!timeRange || typeof timeRange !== "string") {
    throw new Error("Invalid time range");
  }

  const match = timeRange.match(/^(.+?)\s*[-–]\s*(.+)$/);
  if (!match) {
    throw new Error(`Could not parse time range: ${timeRange}`);
  }

  const startMinutes = parseTimeString(match[1].trim());
  const endMinutes = parseTimeString(match[2].trim());

  if (endMinutes <= startMinutes) {
    throw new Error(`End time must be after start time: ${timeRange}`);
  }

  const start = minutesToLocalDate(startMinutes, dateStr);
  const end = minutesToLocalDate(endMinutes, dateStr);

  return {
    startISO: toLocalRFC3339(start),
    endISO: toLocalRFC3339(end),
    startMinutes,
    endMinutes,
  };
}

function minutesToLocalDate(minutes, dateStr = null) {
  let d;
  if (dateStr) {
    const [y, m, day] = dateStr.split("-").map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = new Date();
  }
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

/** RFC3339 with local offset so Google Calendar shows the correct wall-clock time. */
function toLocalRFC3339(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const offMin = -date.getTimezoneOffset();
  const sign = offMin >= 0 ? "+" : "-";
  const abs = Math.abs(offMin);
  const oh = pad(Math.floor(abs / 60));
  const om = pad(abs % 60);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00${sign}${oh}:${om}`
  );
}
