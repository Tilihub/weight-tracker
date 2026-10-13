// Goals: the phases of the plan and the goal weight they give on any date.
// No database here, so any file can import it.

// One stretch of the plan with a straight goal line. endDate is the phase's
// last day, included. The end weight isn't stored: it follows from the rate,
// so the two can't disagree. Bulk or cut is the rate's sign.
export type Phase = {
  startDate: string;
  startWeight: number;
  endDate: string;
  weeklyRate: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// UTC midnight, so every day is exactly MS_PER_DAY long. In local time a day
// across a clock change is 23 or 25 hours, and day counts come out fractional.
function isoDateToMS(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}
function daysBetween(from: string, to: string): number {
  return (isoDateToMS(to) - isoDateToMS(from)) / MS_PER_DAY;
}

// undefined when no phase covers the date: a gap between phases has no goal.
// Dates compare as text, which is time order for YYYY-MM-DD.
export function goalWeight(phases: Phase[], date: string): number | undefined {
  for (const phase of phases) {
    if (phase.startDate <= date && date <= phase.endDate) {
      return (
        phase.startWeight +
        (phase.weeklyRate / 7) * daysBetween(phase.startDate, date)
      );
    }
  }
}
