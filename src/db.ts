// Storage layer. Owns the IndexedDB connection and every read and write to it.
// The exported functions are the whole API; everything else is internal.
// Every exported function returns a promise, including on bad input: bad
// input rejects, it never throws.

import { mergeRecords } from "./merge";

// --- types ---
// A weigh-in as stored. `date` is the measurement day. `modified` is when
// this row was last written — not when it was measured. It exists for the
// two-device merge, which compares it to decide which copy of a date wins.
export type WeightRecord = {
  date: string;
  weight: number;
  modified: number;
};

// --- validation ---
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Validators return null when valid, or a message string when not.
// They never throw and never reject — the caller decides how to report.
function validateWeight(weight: unknown) {
  if (typeof weight !== "number" || !Number.isFinite(weight)) {
    return "weight must be a finite number";
  }
  if (weight < 20 || weight > 300) {
    return "weight must be between 20 and 300 kg";
  }
  return null;
}

function validateDate(date: unknown) {
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
function validateRecord(record: unknown) {
  if (!record || typeof record !== "object") {
    return "record must be an object";
  }
  if (!("date" in record && "weight" in record && "modified" in record)) {
    return "record must have a date, a weight and a modified time stamp";
  }
  if (!Number.isFinite(record.modified)) {
    return "modified time stamp has wrong format";
  }
  return validateDate(record.date) ?? validateWeight(record.weight);
}

function validateRecords(records: WeightRecord[]) {
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
export function addWeight(date: string, weight: number): Promise<WeightRecord> {
  const record: WeightRecord = {
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

// Resolves with the stored record, or undefined if that date has none.
// Rejects on a bad date, or if the read fails.
export function getWeight(date: string): Promise<WeightRecord | undefined> {
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
        resolve(req.result);
      };
      tx.onabort = () => {
        reject(tx.error ?? new Error("the transaction was aborted"));
      };
    });
  });
}

// Resolves with an array of every record, empty if the store is empty.
// Records come back in key order, which is chronological because the keys
// are ISO date strings. No sorting needed downstream.
// Rejects if the read fails.
export function getAllWeights(): Promise<WeightRecord[]> {
  return dbReady.then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WEIGH_INS_STORE, "readonly");
      const req = tx.objectStore(WEIGH_INS_STORE).getAll();
      req.onsuccess = () => {
        resolve(req.result);
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
