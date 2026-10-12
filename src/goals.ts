export type Phase = {
  startDate: string;
  startWeight: number;
  endDate: string;
  weeklyRate: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoDateToMS(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}
function daysBetween(from: string, to: string): number {
  return (isoDateToMS(to) - isoDateToMS(from)) / MS_PER_DAY;
}

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
