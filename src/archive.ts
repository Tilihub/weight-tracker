// The archive: the canonical copy of the history, one JSON file in a private
// GitHub repo. This file owns its format and its trip to and from GitHub.

import type { WeightRecord } from "./db";

// Where the archive lives. A private repo, deliberately separate from this
// public one: a leaked token can then reach the history, but not the code the
// phone runs.
const USERNAME = "Tilihub";
const REPO = "weight-archive";
const ARCHIVE_PATH = "archive.json";
const ARCHIVE_URL = `https://api.github.com/repos/${USERNAME}/${REPO}/contents/${ARCHIVE_PATH}`;

// goals is unknown until the goals model exists. unknown rather than any, so
// the first code to use it is forced to narrow instead of assuming.
export type Archive = {
  records: WeightRecord[];
  goals: unknown;
};

// A 409: the archive changed after the write's sha was read. Its own class so
// the sync can recognise it and retry; other failures are only reported.
export class ArchiveChangedError extends Error {
  name = "ArchiveChangedError";
}

// Turns the archive file's text into something the rest of the app can trust.
// JSON.parse returns any, so every field is established by hand here.
// Types only: whether a date is a real calendar date, whether a weight is
// plausible and whether a date repeats stay with db.ts's validators, which
// still run on what this makes.
// Throws on anything it can't establish — a partial archive read is worse than
// a failed one, because it looks like it worked.
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

    // A new object rather than the parsed one: nothing handed in is mutated,
    // and the array's type is established instead of asserted.
    records.push({ date, weight, modified });
  }

  return { records, goals: parsed.goals };
}

// Indented so each record gets its own lines, and a commit's diff shows only
// the rows that changed; one-line JSON would diff as a single huge line. The
// final newline matches what editors save, so a hand edit doesn't show up as
// a change to the last line.
export function serializeArchive(archive: Archive): string {
  return `${JSON.stringify(archive, null, 2)}\n`;
}

// Resolves with the file's text, decoded from GitHub's base64, and its sha:
// the version a write must name to replace it, so the two travel together.
// Rejects on any non-2xx answer, on an answer that isn't a file, on content
// that doesn't decode, and when there's no connection (fetch's own rejection,
// passed through). The token is a parameter so it never sits in the source,
// which ships to every visitor.
export async function readArchiveFile(
  token: string,
): Promise<{ text: string; sha: string }> {
  const response = await fetch(ARCHIVE_URL, {
    headers: githubHeaders(token),
    // GitHub marks these answers reusable for 60 seconds. Without no-store, a
    // read soon after a write can come from the browser's copy, old sha and all.
    cache: "no-store",
  });

  // fetch resolves on error statuses too; only a missing answer rejects.
  // Checked before the body, which on an error is GitHub's JSON, not the file.
  if (!response.ok) {
    // GitHub answers 404, not 403, when a token can't see a private repo, so
    // a missing file, a token problem and a wrong URL all look the same.
    if (response.status === 404) {
      throw new Error(
        `GitHub answered 404 for ${ARCHIVE_URL}: no file there, or the token can't see the repo`,
      );
    }
    throw new Error(`GitHub answered ${response.status}`);
  }

  // json() is typed any; unknown makes every field below prove itself first.
  const body: unknown = await response.json();

  if (body === null || typeof body !== "object") {
    throw new Error("GitHub's answer isn't an object");
  }
  if (!("type" in body) || body.type !== "file") {
    throw new Error("GitHub's answer isn't a file");
  }
  if (!("encoding" in body) || body.encoding !== "base64") {
    throw new Error("GitHub's answer isn't base64");
  }
  if (!("content" in body) || typeof body.content !== "string") {
    throw new Error("GitHub's content isn't a string");
  }
  if (!("sha" in body) || typeof body.sha !== "string") {
    throw new Error("GitHub's sha isn't a string");
  }

  let text = "";
  try {
    text = base64ToText(body.content);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`GitHub's content doesn't decode: ${detail}`);
  }

  return { text, sha: body.sha };
}

// Replaces the archive with text, only if it's still at sha: the version the
// text was based on. Rejects with ArchiveChangedError on 409, an Error on any
// other non-2xx answer, and fetch's own error when no answer arrives. With no
// answer, the write may still have happened; only the next read can tell.
export async function writeArchiveFile(
  token: string,
  text: string,
  sha: string,
): Promise<void> {
  const content = textToBase64(text);

  const response = await fetch(ARCHIVE_URL, {
    method: "PUT",
    body: JSON.stringify({ message: "Sync", content, sha }),
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `GitHub answered 404 for ${ARCHIVE_URL}: no file there, or the token can't see the repo`,
      );
    }
    if (response.status === 409) {
      throw new ArchiveChangedError(
        "GitHub answered 409: the archive changed since it was read",
      );
    }
    throw new Error(`GitHub answered ${response.status}`);
  }
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    // Pinned, so GitHub's changes can't alter the answer. A retired version
    // answers 410; each lasts at least 24 months after its successor ships.
    "X-GitHub-Api-Version": "2026-03-10",
  };
}

// Base64 to bytes, then bytes to text as UTF-8. Not atob: it returns the bytes
// disguised as characters, which is only the right text while everything is
// ASCII, and goals will hold whatever gets typed. fatal makes invalid UTF-8
// throw rather than turn into "�", which the next sync would write back.
function base64ToText(base64: string): string {
  const bytes = Uint8Array.fromBase64(base64);
  const decoder = new TextDecoder("utf-8", { fatal: true });

  return decoder.decode(bytes);
}

// The reverse of base64ToText, and not btoa, which only handles Latin-1. Text
// from JSON.stringify always encodes exactly, so there's nothing to catch.
function textToBase64(text: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);

  return bytes.toBase64();
}
