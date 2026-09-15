const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const dbReady = new Promise((resolve, reject) => {
  const request = indexedDB.open("weightTracker", 1);
  request.onsuccess = (event) => {
    resolve(event.target.result);
  };
  request.onupgradeneeded = (event) => {
    event.target.result.createObjectStore("weighIns", { keyPath: "date" });
  };
  request.onerror = (event) => {
    reject(event.target.error);
  };
});

function addWeight(date, weight) {
  if (typeof date !== "string" || !ISO_DATE.test(date)) {
    return Promise.reject(new Error("date must be YYYY-MM-DD"));
  }
  if (!Number.isFinite(weight)) {
    return Promise.reject(new Error("weight must be a finite number"));
  }
  return dbReady.then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("weighIns", "readwrite");
      const data = {
        date,
        weight,
        modified: Date.now(),
      };
      tx.objectStore("weighIns").put(data);
      tx.oncomplete = () => {
        resolve(data);
      };
      tx.onerror = () => {
        reject(tx.error);
      };
    });
  });
}

function getWeight(date) {
  if (typeof date !== "string" || !ISO_DATE.test(date)) {
    return Promise.reject(new Error("date must be YYYY-MM-DD"));
  }
  return dbReady.then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("weighIns", "readonly");
      const req = tx.objectStore("weighIns").get(date);
      req.onsuccess = () => {
        resolve(req.result);
      };
      tx.onerror = () => {
        reject(tx.error);
      };
    });
  });
}

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
