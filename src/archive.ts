// Turns the archive file's text into something the rest of the app can trust.
// JSON.parse returns any, so every field is established by hand here.
// Types only: whether a date is a real calendar date and whether a weight is
// plausible stay with db.ts's validators, which still run on what this makes.
// Throws on anything it can't establish — a partial archive read is worse than
// a failed one, because it looks like it worked.

import type { WeightRecord } from "./db";

// goals is unknown until the goals model exists. unknown rather than any, so
// the first code to use it is forced to narrow instead of assuming.
export type Archive = {
  records: WeightRecord[];
  goals: unknown;
};

export function parseArchive(text: string): Archive {
  let parsed: unknown;

  // Only JSON.parse is wrapped. Every throw below is this function's own, and
  // catching those here would relabel them as malformed JSON.
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    // SyntaxError says where the text broke, which is the most useful thing
    // there is when the file has been edited by hand.
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`the file is not valid JSON: ${detail}`);
  }

  // typeof null is "object", so null is ruled out separately.
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("the archive must be an object");
  }
  if (!("records" in parsed)) {
    throw new Error("the archive must have a records array");
  }
  if (!Array.isArray(parsed.records)) {
    throw new Error("records must be an array");
  }
  if (!("goals" in parsed)) {
    throw new Error("the archive must have goals");
  }

  // Array.isArray narrows to any[], which would make every element any and
  // silence the checks below. unknown[] forces each one to be narrowed.
  const rawRecords: unknown[] = parsed.records;

  const records: WeightRecord[] = [];
  const dates = new Set<string>();

  // One stamp for the whole file: every record missing modified came from the
  // same hand edit, so separate times would imply an order that isn't real.
  const now = Date.now();

  for (const [i, entry] of rawRecords.entries()) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`records[${i}] must be an object`);
    }

    if (!("date" in entry)) {
      throw new Error(`records[${i}] has no date`);
    }
    const date = entry.date;
    if (typeof date !== "string") {
      throw new Error(`records[${i}] date must be a string`);
    }

    if (!("weight" in entry)) {
      throw new Error(`records[${i}] has no weight`);
    }
    const weight = entry.weight;
    if (typeof weight !== "number") {
      throw new Error(`records[${i}] weight must be a number`);
    }

    // Three outcomes, not two. Absent means a row added by hand and is
    // stamped; present but not a number is a malformed value and fails.
    // Collapsing them would silently stamp over a typo like "1758499200000",
    // losing the archive's own timestamp without a word.
    let modified = now;
    if ("modified" in entry) {
      if (typeof entry.modified !== "number") {
        throw new Error(`records[${i}] modified must be a number`);
      }
      modified = entry.modified;
    }

    // Caught here rather than left to putWeights: mergeRecords runs first, and
    // a duplicate remote date makes it compare remote against remote, so the
    // merge would already be wrong by the time the store rejected anything.
    if (dates.has(date)) {
      throw new Error(`records[${i}] repeats the date ${date}`);
    }
    dates.add(date);

    // A new object rather than the parsed one: nothing handed in is mutated,
    // and the array's type is established instead of asserted.
    records.push({ date, weight, modified });
  }

  return { records, goals: parsed.goals };
}
