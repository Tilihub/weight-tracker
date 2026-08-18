// trend-line.js
// Core piecewise goal-line logic for the weight tracker.
//
// Dates are plain 'YYYY-MM-DD' strings everywhere. A date-only ISO string
// like '2026-01-01' is parsed by JS as UTC midnight; the moment a
// time-of-day gets added, parsing silently switches to local time. That
// mismatch is a classic source of off-by-one-day bugs. Pinning everything
// to UTC via toUTC() below sidesteps it entirely — never compare a
// date-only string against a full Date object without going through this.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toUTC(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`);
}

function daysBetween(dateStrA, dateStrB) {
  return Math.round((toUTC(dateStrB) - toUTC(dateStrA)) / MS_PER_DAY);
}

/**
 * Mean weight over the `windowDays`-day window ending on (and including)
 * endDateStr. Returns null if no entries fall in that window — there's
 * nothing sensible to average, so the caller (the phase editor) should
 * leave the field blank rather than show a fabricated number.
 */
function averageWeight(entries, endDateStr, windowDays = 7) {
  const end = toUTC(endDateStr);
  const start = new Date(end.getTime() - (windowDays - 1) * MS_PER_DAY);

  const inWindow = entries.filter((e) => {
    const d = toUTC(e.date);
    return d >= start && d <= end;
  });

  if (inWindow.length === 0) return null;

  const sum = inWindow.reduce((acc, e) => acc + e.weight, 0);
  return Math.round((sum / inWindow.length) * 100) / 100; // 2dp
}

/**
 * Finds the phase governing a given date, or null if the date falls
 * before the first phase starts, in a gap between phases, or after the
 * last phase's endDate with nothing newer defined yet.
 *
 * phases: [{ startDate, endDate: string|null, type, weeklyRate, startWeight }]
 */
function findPhase(phases, dateStr) {
  const d = toUTC(dateStr);

  const covering = phases
    .filter((p) => toUTC(p.startDate) <= d)
    .sort((a, b) => toUTC(b.startDate) - toUTC(a.startDate));

  if (covering.length === 0) return null; // nothing has started yet

  const phase = covering[0]; // latest startDate <= d wins (handles overlaps)

  if (phase.endDate && toUTC(phase.endDate) < d) return null; // that phase already ended; nothing newer covers this date

  return phase;
}

/**
 * Goal weight for a date, or null if no phase covers it (an accepted gap).
 * Smooth interpolation: weeklyRate / 7 applied per day since the phase's
 * startDate.
 */
function goalWeightForDate(phases, dateStr) {
  const phase = findPhase(phases, dateStr);
  if (!phase) return null;

  const days = daysBetween(phase.startDate, dateStr);
  const dailyRate = phase.weeklyRate / 7;

  return Math.round((phase.startWeight + days * dailyRate) * 100) / 100;
}

/**
 * True if dateStr is a real calendar date in strict 'YYYY-MM-DD' form.
 * Rejects malformed strings (wrong shape, non-digits) and impossible
 * dates (month 13, Feb 30, etc). The toISOString round-trip check is a
 * defensive backstop: if a JS engine ever parsed an out-of-range
 * component leniently instead of returning Invalid Date, the round trip
 * would still catch the mismatch.
 */
function isValidDateStr(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = toUTC(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === dateStr;
}

export { toUTC, daysBetween, averageWeight, findPhase, goalWeightForDate, isValidDateStr };
