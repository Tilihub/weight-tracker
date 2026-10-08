import { useState, useEffect } from "react";
import { addWeight, getAllWeights, getWeight, type WeighIn } from "./db";
import { errorToString } from "./errors";
import { sync } from "./sync";

// localStorage key for the GitHub token. Changing it loses the token saved on
// every device.
const TOKEN_KEY = "githubToken";

// Today as YYYY-MM-DD from local date parts; toISOString() would give the UTC
// day, which is the wrong one for part of every evening. Called at the moment
// of an action, never stored, so a page left open overnight still saves right.
function localToday() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function App() {
  const [weightText, setWeightText] = useState("");
  const [tokenText, setTokenText] = useState("");
  const [todayWeight, setTodayWeight] = useState<number | null>(null);
  const [records, setRecords] = useState<WeighIn[]>([]);

  // message is the outcome of an action; todayWeight is a fact about what's
  // stored. Kept apart so a failed save doesn't wipe the number off the screen.
  const [message, setMessage] = useState("");

  // Runs once, after the first render. An effect's function can't be async, so
  // this is .then/.catch. Known gap: today's record is read only at startup, so
  // a page left open past midnight keeps showing yesterday's.
  useEffect(() => {
    getWeight(localToday())
      .then((record) => setTodayWeight(record?.weight ?? null))
      .catch((error) => setMessage(errorToString(error)));

    getAllWeights()
      .then(setRecords)
      .catch((error) => setMessage(errorToString(error)));
  }, []);

  async function handleSaveWeight() {
    const text = weightText.trim();
    if (text === "") {
      setMessage("Enter a weight");
      return;
    }

    const weight = Number(text);
    const date = localToday();

    try {
      const record = await addWeight(date, weight);
      setTodayWeight(record.weight);
      setMessage("Weight saved");
    } catch (error) {
      setMessage(errorToString(error));
    }
  }

  function handleSaveToken() {
    const token = tokenText.trim();
    if (token === "") {
      setMessage("Enter a token");
      return;
    }

    try {
      localStorage.setItem(TOKEN_KEY, token);
      // Emptied so the token doesn't stay on screen.
      setTokenText("");
      setMessage("Token saved");
    } catch (error) {
      setMessage(errorToString(error));
    }
  }

  async function handleSync() {
    // getItem is inside the try: it throws if the browser blocks storage.
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token === null) {
        setMessage("No token saved yet");
        return;
      }
      setMessage("Syncing...");
      await sync(token);
      setMessage("Synced");
    } catch (error) {
      setMessage(errorToString(error));
    }
  }

  return (
    <>
      <h1>hello again</h1>
      <input
        value={weightText}
        placeholder="Weight"
        onChange={(event) => setWeightText(event.target.value)}
      />
      {/* The async handlers return a promise; onClick wants nothing back. void
        says the promise is ignored on purpose. */}
      <button onClick={() => void handleSaveWeight()}>Save weight</button>
      <div>{localToday()}</div>
      <div>{message}</div>
      <div>
        {todayWeight !== null ? `${todayWeight} kg` : "No weigh in today"}
      </div>
      <input
        type="password"
        value={tokenText}
        placeholder="GitHub token"
        onChange={(event) => setTokenText(event.target.value)}
      />
      <button onClick={handleSaveToken}>Save token</button>
      <button onClick={() => void handleSync()}>Sync</button>
      <ul>
        {records.toReversed().map((record) => (
          <li key={record.date}>
            {record.date} - {record.weight}
          </li>
        ))}
      </ul>
    </>
  );
}

export default App;
