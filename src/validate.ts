// The checks run before anything is stored. They test what's possible, not
// what's usual. No database here, so any file can import them.

import type { WeightRecord } from "./db";
import type { Phase } from "./goals";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Validators return null when valid, or a message string when not.
// They never throw and never reject — the caller decides how to report.
export function validateWeight(weight: number): string | null {
  if (!Number.isFinite(weight)) {
    return "weight must be a finite number";
  }
  if (weight < 20 || weight > 300) {
    return "weight must be between 20 and 300 kg";
  }
  return null;
}

export function validateDate(date: string): string | null {
  if (!ISO_DATE.test(date)) {
    return "date must be YYYY-MM-DD";
  }
  const [year, month, day] = date.split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day))
    .toISOString()
    .slice(0, 10);
  if (date !== calendarDate) {
    return "date does not exist";
  }
  return null;
}

// `modified` is checked here because bulk writes take it from the caller,
// and that caller's data can come from a file someone edited by hand.
function validateRecord(record: WeightRecord): string | null {
  const dateError = validateDate(record.date);
  if (dateError) {
    return dateError;
  }
  if (!Number.isFinite(record.modified)) {
    return "modified must be a finite number";
  }
  // A null weight is a tombstone: there is no weight to check.
  if (record.weight === null) {
    return null;
  }
  const weightError = validateWeight(record.weight);
  if (weightError) {
    return weightError;
  }

  return null;
}

export function validateRecords(records: WeightRecord[]): string | null {
  const dates = new Set<string>();
  for (const [i, record] of records.entries()) {
    const recordError = validateRecord(record);
    if (recordError) {
      return `records[${i}] raised an error because ${recordError}`;
    }
    // Two records for one date: the merge would keep one and silently drop the other.
    if (dates.has(record.date)) {
      return `duplicate ${record.date}`;
    }
    dates.add(record.date);
  }

  return null;
}

function validatePhase(phase: Phase): string | null {
  const startDateError = validateDate(phase.startDate);
  if (startDateError) {
    return `startDate: ${startDateError}`;
  }
  const endDateError = validateDate(phase.endDate);
  if (endDateError) {
    return `endDate: ${endDateError}`;
  }
  if (phase.startDate >= phase.endDate) {
    return "end date must be after start date";
  }
  const weightError = validateWeight(phase.startWeight);
  if (weightError) {
    return weightError;
  }
  if (!Number.isFinite(phase.weeklyRate)) {
    return "weekly rate must be a finite number";
  }
  return null;
}

export function validatePhases(phases: Phase[]): string | null {
  for (const [i, phase] of phases.entries()) {
    const phaseError = validatePhase(phase);
    if (phaseError) {
      return `phases[${i}] raised an error because ${phaseError}`;
    }
    if (i > 0 && phase.startDate <= phases[i - 1].endDate) {
      return `phases[${i}] start date must be after the previous phase's end date`;
    }
  }
  return null;
}
