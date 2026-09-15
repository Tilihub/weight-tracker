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
  dbReady.then((db) => {
    console.log(db);
  });
}
