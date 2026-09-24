// The archive: the canonical copy of the history, one JSON file in a private
// GitHub repo. This file owns its format and its trip to and from GitHub.

// Where the archive lives. A private repo, deliberately separate from this
// public one: a leaked token can then reach the history, but not the code the
// phone runs.
const USERNAME = "Tilihub";
const REPO = "weight-archive";
const ARCHIVE_PATH = "archive.json";

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

export function serializeArchive(archive: Archive): string {
  return `${JSON.stringify(archive, null, 2)}\n`;
}

// Resolves with the file's content, still base64 as GitHub sends it, and its
// sha: the version a write must name to replace it, so the two travel
// together. Rejects on any non-2xx answer, on an answer that isn't a file,
// and when there's no connection (fetch's own rejection, passed through).
// The token is a parameter so it never sits in the source, which ships to
// every visitor.
export async function readArchiveFile(
  token: string,
): Promise<{ content: string; sha: string }> {
  const url = `https://api.github.com/repos/${USERNAME}/${REPO}/contents/${ARCHIVE_PATH}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      // Pinned, so GitHub's changes can't alter the answer. A retired version
      // answers 410; each lasts at least 24 months after its successor ships.
      "X-GitHub-Api-Version": "2026-03-10",
    },
    // GitHub marks these answers reusable for 60 seconds. Without no-store, a
    // read soon after a write can come from the browser's copy, old sha and all.
    cache: "no-store",
  });

  // fetch resolves on error statuses too; only a missing answer rejects.
  // Checked before the body, which on an error is GitHub's JSON, not the file.
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `ERROR ${response.status} - no such file or this token can't see the repo`,
      );
    }
    throw new Error(`ERROR ${response.status}`);
  }

  // json() is typed any; unknown makes every field below prove itself first.
  const body: unknown = await response.json();

  if (body === null || typeof body !== "object") {
    throw new Error("the responce body must be an object");
  }
  if (!("type" in body)) {
    throw new Error("the responce body type must have a type");
  }
  if (body.type !== "file") {
    throw new Error("the responce body type must be a file");
  }
  if (!("encoding" in body)) {
    throw new Error("the responce body type must have encoding");
  }
  if (body.encoding !== "base64") {
    throw new Error("the responce body encoding must be base64");
  }
  if (!("content" in body)) {
    throw new Error("the responce body type must have content");
  }
  if (typeof body.content !== "string") {
    throw new Error("the responce body content must be a string");
  }
  if (!("sha" in body)) {
    throw new Error("the responce body type must have sha");
  }
  if (typeof body.sha !== "string") {
    throw new Error("the responce body sha must be a string");
  }

  return { content: body.content, sha: body.sha };
}
