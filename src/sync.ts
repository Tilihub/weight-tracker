// Sync between the local store and the archive. It uses both db.ts and
// archive.ts, so it sits above them rather than in either.

import {
  parseArchive,
  readArchiveFile,
  serializeArchive,
  writeArchiveFile,
  type Archive,
} from "./archive";
import { mergeWeights } from "./db";

// Merges the archive into the local store, then writes the merged set back
// when it differs from the archive.
// Rejects with the first failure, unchanged, for the caller to report.
// ArchiveChangedError means the archive changed after it was read; syncing
// again fixes it. A failed write needs no undo: the local store is already
// merged, and the next sync pushes it.
export async function sync(token: string): Promise<void> {
  const { text, sha } = await readArchiveFile(token);
  const { records, goals } = parseArchive(text);

  const merged = await mergeWeights(records);
  // Goals are copied as they are: nothing on this device holds goals yet.
  const newArchive: Archive = { records: merged, goals };
  const newText = serializeArchive(newArchive);

  // Skipped when nothing changed: GitHub commits even identical content.
  // Compared as text, not records, so a stamp parsing added to a hand-typed
  // row still counts as a change and gets written back.
  if (newText !== text) {
    await writeArchiveFile(token, newText, sha);
  }
}
