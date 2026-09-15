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
  return dbReady.then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("weighIns", "readwrite");
      const data = {
        date: date,
        weight: weight,
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
