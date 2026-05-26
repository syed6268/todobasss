export function parseTimeString(timeStr) {
  if (!timeStr) return 0;
  const trimmed = timeStr.trim();

  const meridiemMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (meridiemMatch) {
    let [, h, m, period] = meridiemMatch;
    h = parseInt(h, 10);
    m = parseInt(m, 10);
    if (/PM/i.test(period) && h !== 12) h += 12;
    if (/AM/i.test(period) && h === 12) h = 0;
    return h * 60 + m;
  }

  const hmMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (hmMatch) {
    return parseInt(hmMatch[1], 10) * 60 + parseInt(hmMatch[2], 10);
  }

  return 0;
}

export function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHours}:${mins.toString().padStart(2, "0")} ${period}`;
}

export function isoToMinutesOfDay(iso, timeZone) {
  const d = new Date(iso);
  if (timeZone) {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }).formatToParts(d);
    const h = parseInt(parts.find((p) => p.type === "hour").value, 10);
    const m = parseInt(parts.find((p) => p.type === "minute").value, 10);
    return h * 60 + m;
  }
  return d.getHours() * 60 + d.getMinutes();
}
