// Storage layer. Owns the IndexedDB connection and every read and write to it.
// The exported functions are the whole API; everything else is internal.
// Every exported function returns a promise, including on bad input: bad
// input rejects, it never throws.

import { mergeRecords } from "./merge";

// --- types ---
// A weigh-in as stored. `date` is the measurement day. `modified` is when
// this row was last written — not when it was measured. It exists for the
// two-device merge, which compares it to decide which copy of a date wins.
export type WeighIn = {
  date: string;
  weight: number;
  modified: number;
};

// A deleted day. It replaces the row instead of removing it, so the deletion
// reaches the archive and the other device: its newer `modified` wins the
// merge like any edit. No weight, so nothing can show or plot one by mistake.
export type Tombstone = {
  date: string;
  deleted: true;
  modified: number;
};

// Anything the store holds. The sync works with both kinds; the readers the
// screen uses return weigh-ins only.
export type WeightRecord = WeighIn | Tombstone;

// --- validation ---
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Validators return null when valid, or a message string when not.
// They never throw and never reject — the caller decides how to report.
function validateWeight(weight: unknown): string | null {
  if (typeof weight !== "number" || !Number.isFinite(weight)) {
    return "weight must be a finite number";
  }
  if (weight < 20 || weight > 300) {
    return "weight must be between 20 and 300 kg";
  }
  return null;
}

function validateDate(date: unknown): string | null {
  if (typeof date !== "string" || !ISO_DATE.test(date)) {
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
function validateRecord(record: unknown): string | null {
  if (record === null || typeof record !== "object") {
    return "record must be an object";
  }
  if (!("date" in record && "modified" in record)) {
    return "date and modified must be present";
  }
  const dateError = validateDate(record.date);
  if (dateError) {
    return dateError;
  }
  if (!Number.isFinite(record.modified)) {
    return "modified must be a finite number";
  }
  // Exactly one of weight and deleted. getWeight tells the kinds apart by
  // deleted, getAllWeights by weight, and a record with both or neither
  // would show in one but not the other.
  if ("weight" in record && "deleted" in record) {
    return "weight and deleted can't both be present";
  }
  if ("weight" in record) {
    return validateWeight(record.weight);
  }
  if (!("deleted" in record)) {
    return "weight or deleted must be present";
  }
  if (record.deleted !== true) {
    return "deleted must be true";
  }
  return null;
}

function validateRecords(records: WeightRecord[]): string | null {
  if (!Array.isArray(records)) {
    return "records must be an array";
  }
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

// --- connection ---
// TypeScript can't check object store names, so every use goes through this
// constant. Keep the value as it is: existing data is stored under that name.
const WEIGH_INS_STORE = "weighIns";

// One connection, opened once at load. Wrapped in a promise so callers
// made before the database is ready simply wait instead of failing.
// Known gap: onblocked isn't handled. If a future version bump runs while
// another tab still has the database open, opening waits until that tab
// closes, and so does everything that uses dbReady.
const dbReady = new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open("weightTracker", 1);
  req.onsuccess = () => {
    resolve(req.result);
  };
  req.onupgradeneeded = () => {
    req.result.createObjectStore(WEIGH_INS_STORE, { keyPath: "date" });
  };
  req.onerror = () => {
    reject(req.error ?? new Error("could not open the database"));
  };
});

// --- operations ---
// Failures reject from the transaction's abort event, not its error event:
// tx.error is only set once the transaction has aborted, and error fires
// before that. The fallback covers a manual abort(), where tx.error stays null.

// Resolves with the stored record. Rejects on a bad date or weight, or if the
// write fails.
// modified is stamped here, not passed in, so the UI path can't forget it.
// mergeWeights is deliberately the opposite: it writes modified exactly as
// given, because restamping would destroy the only field the merge compares.
export function addWeight(date: string, weight: number): Promise<WeighIn> {
  const record: WeighIn = {
    date,
    weight,
    modified: Date.now(),
  };
  const validationError = validateRecord(record);
  if (validationError) {
    return Promise.reject(new Error(validationError));
  }
  return dbReady.then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WEIGH_INS_STORE, "readwrite");
      tx.objectStore(WEIGH_INS_STORE).put(record);
      // Resolve on the transaction, not the put request. A successful request
      // only means the write was queued — nothing is durable until the
      // transaction commits.
      tx.oncomplete = () => {
        resolve(record);
      };
      tx.onabort = () => {
        reject(tx.error ?? new Error("the transaction was aborted"));
      };
    });
  });
}

// Replaces that date's weigh-in with a tombstone. Resolves with nothing,
// whether or not there was a weigh-in to delete. Rejects on a bad date, or if
// the transaction fails.
// The read and the write share one transaction, so the row can't change in
// between.
export function deleteWeight(date: string): Promise<void> {
  const tombstone: Tombstone = { date, deleted: true, modified: Date.now() };
  const validationError = validateRecord(tombstone);
  if (validationError) {
    return Promise.reject(new Error(validationError));
  }
  return dbReady.then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WEIGH_INS_STORE, "readwrite");
      const store = tx.objectStore(WEIGH_INS_STORE);
      const req = store.get(date);
      req.onsuccess = () => {
        const record: WeightRecord | undefined = req.result;
        // Only a weigh-in is replaced. A tombstone on an empty or already
        // deleted day could be newer than a weigh-in the other device hasn't
        // synced yet, and would delete it in the merge.
        if (record !== undefined && "weight" in record) {
          store.put(tombstone);
        }
      };
      tx.oncomplete = () => {
        resolve();
      };
      tx.onabort = () => {
        reject(tx.error ?? new Error("the transaction was aborted"));
      };
    });
  });
}

// Resolves with that date's weigh-in, or undefined if it has none or it was
// deleted. Rejects on a bad date, or if the read fails.
export function getWeight(date: string): Promise<WeighIn | undefined> {
  const dateError = validateDate(date);
  if (dateError) {
    return Promise.reject(new Error(dateError));
  }
  return dbReady.then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WEIGH_INS_STORE, "readonly");
      const req = tx.objectStore(WEIGH_INS_STORE).get(date);
      // Reads resolve on the request, not the transaction — req.result is the
      // only place the data appears. A miss is not an error: result is undefined.
      req.onsuccess = () => {
        const record: WeightRecord | undefined = req.result;
        if (record === undefined || "deleted" in record) {
          resolve(undefined);
          return;
        }
        resolve(record);
      };
      tx.onabort = () => {
        reject(tx.error ?? new Error("the transaction was aborted"));
      };
    });
  });
}

// Resolves with every weigh-in, empty if there are none. Tombstones are left
// out, as in getWeight.
// Records come back in key order, which is chronological because the keys
// are ISO date strings. No sorting needed downstream.
// Rejects if the read fails.
export function getAllWeights(): Promise<WeighIn[]> {
  return dbReady.then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WEIGH_INS_STORE, "readonly");
      const req = tx.objectStore(WEIGH_INS_STORE).getAll();
      req.onsuccess = () => {
        const records: WeightRecord[] = req.result;
        // Tests for weight rather than for a missing deleted: TypeScript only
        // narrows filter's result from a positive test.
        resolve(records.filter((r) => "weight" in r));
      };
      tx.onabort = () => {
        reject(tx.error ?? new Error("the transaction was aborted"));
      };
    });
  });
}

// Merges the archive's records into the store and resolves with the merged
// set, which is what the sync pushes back. Rejects on a bad or duplicate
// record before anything is written, or if the transaction fails.
// Read, merge and write share one transaction. With separate ones, a save
// landing in between would be overwritten by the copy read before it, and
// lost from both sides.
export function mergeWeights(records: WeightRecord[]): Promise<WeightRecord[]> {
  const recordsError = validateRecords(records);
  if (recordsError) {
    return Promise.reject(new Error(recordsError));
  }
  return dbReady.then((db) => {
    return new Promise((resolve, reject) => {
      let merged: WeightRecord[] = [];
      const tx = db.transaction(WEIGH_INS_STORE, "readwrite");
      const store = tx.objectStore(WEIGH_INS_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        // Keep this synchronous: the transaction commits as soon as the
        // handler returns with nothing queued, so an await would close it
        // before the puts.
        merged = mergeRecords(req.result, records);
        for (const record of merged) {
          store.put(record);
        }
      };
      tx.oncomplete = () => {
        resolve(merged);
      };
      tx.onabort = () => {
        reject(tx.error ?? new Error("the transaction was aborted"));
      };
    });
  });
}
