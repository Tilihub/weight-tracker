// Merge rules for two copies of the history: the local database and the
// archive. Pure — no database, no network, nothing outside the arguments —
// so it can be exercised from the console with hand-written arrays.
// The result is written back to both sides, so both end up identical.
// Never restamps modified: it's the only thing the comparison has to go on.

import type { WeightRecord } from "./db";

export function mergeRecords(
  local: WeightRecord[],
  remote: WeightRecord[],
): WeightRecord[] {
  const merged = new Map<string, WeightRecord>();

  for (const localRecord of local) {
    merged.set(localRecord.date, localRecord);
  }

  // One side only -> that row. Both -> the newer modified wins, and ties go
  // to remote. That tie is deliberate: equal modified means the archive's
  // copy came from this exact local write, so a difference can only be a hand
  // edit of the archive. Strictly `>`, never `>=`, or hand edits are lost.
  // A deleted day needs no rule of its own: it's a row with a null weight, so
  // it wins or loses on modified like any other.
  for (const remoteRecord of remote) {
    const date = remoteRecord.date;
    const localRecord = merged.get(date);

    if (localRecord && localRecord.modified > remoteRecord.modified) {
      continue;
    }
    merged.set(date, remoteRecord);
  }

  // Dates are YYYY-MM-DD, so text order is time order.
  const records = [...merged.values()].toSorted((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );

  return records;
}
