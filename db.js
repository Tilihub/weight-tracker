// Storage layer. Owns the IndexedDB connection and every read/write to it.
// Every function here returns a promise. app.js talks to the store only
// through addWeight / getWeight / getAllWeights / importWeights.

// --- validation ---
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Validators return null when valid, or a message string when not.
// They never throw and never reject — the caller decides how to report.
function validateWeight(weight) {
  if (Number.isFinite(weight)) {
    return null;
  }
  return "weight must be a finite number";
}

function validateDate(date) {
  if (typeof date === "string" && ISO_DATE.test(date)) {
    return null;
  }
  return "date must be YYYY-MM-DD";
}

function validateRecord(record) {
  if (!record || typeof record !== "object") {
    return "record must be an object";
  }
  return validateDate(record.date) ?? validateWeight(record.weight);
}

// --- connection ---
// One connection, opened once at load. Wrapped in a promise so callers
// made before the database is ready simply wait instead of failing.
// Known gap: an error thrown inside onupgradeneeded escapes this promise,
// leaving it pending forever. onblocked is not handled either.
const dbReady = new Promise((resolve, reject) => {
  const req = indexedDB.open("weightTracker", 1);
  req.onsuccess = (event) => {
    resolve(event.target.result);
  };
  req.onupgradeneeded = (event) => {
    event.target.result.createObjectStore("weighIns", { keyPath: "date" });
  };
  req.onerror = (event) => {
    reject(event.target.error);
  };
});

// --- operations ---

// Resolves with the stored record. Rejects on a bad date or weight.
// modified is stamped here, not passed in, so no caller can forget it.
// It means "when this row was last written", which is what the two-device
// merge needs. The measurement date is `date`.
function addWeight(date, weight) {
  const record = {
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
      const tx = db.transaction("weighIns", "readwrite");
      tx.objectStore("weighIns").put(record);
      // Resolve on the transaction, not the put request. A successful request
      // only means the write was queued — nothing is durable until the
      // transaction commits.
      tx.oncomplete = () => {
        resolve(record);
      };
      tx.onerror = () => {
        reject(tx.error);
      };
    });
  });
}

// Resolves with the stored record, or undefined if that date has none.
// Rejects on a bad date.
function getWeight(date) {
  const dateError = validateDate(date);
  if (dateError) {
    return Promise.reject(new Error(dateError));
  }
  return dbReady.then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("weighIns", "readonly");
      const req = tx.objectStore("weighIns").get(date);
      // Reads resolve on the request, not the transaction — req.result is the
      // only place the data appears. A miss is not an error: result is undefined.
      req.onsuccess = () => {
        resolve(req.result);
      };
      tx.onerror = () => {
        reject(tx.error);
      };
    });
  });
}

// Resolves with an array of every record, empty if the store is empty.
// Records come back in key order, which is chronological because the keys
// are ISO date strings. No sorting needed downstream.
function getAllWeights() {
  return dbReady.then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("weighIns", "readonly");
      const req = tx.objectStore("weighIns").getAll();
      req.onsuccess = () => {
        resolve(req.result);
      };
      tx.onerror = () => {
        reject(tx.error);
      };
    });
  });
}

// Resolves with the number of records written. Rejects if any record fails
// validation, in which case nothing is written at all.
function importWeights(records) {
  // Validate everything before opening the transaction, so a bad record
  // means the database is never touched at all.
  let idx = 0;
  for (const record of records) {
    const recordError = validateRecord(record);
    if (recordError) {
      return Promise.reject(
        new Error(
          `Record number: ${idx} raised an error because ${recordError}`,
        ),
      );
    }
    idx += 1;
  }
  return dbReady.then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("weighIns", "readwrite");
      const store = tx.objectStore("weighIns");
      const now = Date.now();
      // All puts must be queued in one synchronous pass. The transaction
      // auto-commits as soon as this code yields with nothing left queued,
      // so any await or .then() in here would close it underneath us.
      // One `now` for the whole batch marks these as a single import.
      for (const source of records) {
        const record = {
          date: source.date,
          weight: source.weight,
          modified: now,
        };
        store.put(record);
      }
      tx.oncomplete = () => {
        resolve(records.length);
      };
      tx.onerror = () => {
        reject(tx.error);
      };
    });
  });
}
