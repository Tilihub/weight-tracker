// Storage layer. Owns the IndexedDB connection and every read and write to it.
// The exported functions are the whole API; everything else is internal.
// Every exported function returns a promise.

// --- types ---
// WeightInput is a weigh-in as it arrives, from the UI or an imported file.
// WeightRecord is what gets stored: the same, plus when it was last written.
type WeightInput = {
  date: string;
  weight: number;
};

type WeightRecord = WeightInput & { modified: number };

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
  const calenderDate = new Date(Date.UTC(year, month - 1, day))
    .toISOString()
    .slice(0, 10);
  if (date !== calenderDate) {
    return "date does not exist";
  }
  return null;
}

function validateRecord(record: unknown) {
  if (!record || typeof record !== "object") {
    return "record must be an object";
  }
  if (!("date" in record) || !("weight" in record)) {
    return "record must have a date and weight";
  }
  return validateDate(record.date) ?? validateWeight(record.weight);
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
    reject(req.error ?? new Error("the request returned an error"));
  };
});

// --- operations ---
// Failures reject from the transaction's abort event, not its error event:
// tx.error is only set once the transaction has aborted, and error fires
// before that. The fallback covers a manual abort(), where tx.error stays null.

// Resolves with the stored record. Rejects on a bad date or weight, or if the
// write fails.
// modified is stamped here, not passed in, so no caller can forget it.
// It means "when this row was last written", which is what the two-device
// merge needs. The measurement date is `date`.
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
        reject(tx.error ?? new Error("could not open the database"));
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
        reject(tx.error ?? new Error("could not open the database"));
      };
    });
  });
}

// Resolves with the number of records written. Rejects if any record fails
// validation or the write fails; either way, nothing is written at all.
export function importWeights(records: WeightInput[]): Promise<number> {
  // Validate everything before opening the transaction, so a bad record
  // means the database is never touched at all.
  for (const [i, record] of records.entries()) {
    const recordError = validateRecord(record);
    if (recordError) {
      return Promise.reject(
        new Error(`records[${i}] raised an error because ${recordError}`),
      );
    }
  }
  return dbReady.then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WEIGH_INS_STORE, "readwrite");
      const store = tx.objectStore(WEIGH_INS_STORE);
      const now = Date.now();
      // All puts must be queued in one synchronous pass. The transaction
      // auto-commits as soon as this code yields with nothing left queued,
      // so any await or .then() in here would close it underneath us.
      // One `now` for the whole batch marks these as a single import.
      for (const source of records) {
        const record: WeightRecord = {
          date: source.date,
          weight: source.weight,
          modified: now,
        };
        store.put(record);
      }
      tx.oncomplete = () => {
        resolve(records.length);
      };
      tx.onabort = () => {
        reject(tx.error ?? new Error("the transaction was aborted"));
      };
    });
  });
}
