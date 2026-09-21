import { useState, useEffect } from "react";
import { addWeight, getAllWeights, getWeight, type WeightRecord } from "./db";

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

// A rejected promise's error is typed any, which passes every check. unknown
// forces the narrowing to happen here, once.
function errorToString(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function App() {
  const [weightText, setWeightText] = useState("");
  const [todayWeight, setTodayWeight] = useState<number | null>(null);
  const [records, setRecords] = useState<WeightRecord[]>([]);

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

  async function handleSave() {
    const text = weightText.trim();
    if (text === "") {
      setMessage("enter a weight");
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

  return (
    <>
      <h1>hello again</h1>
      <input
        value={weightText}
        onChange={(event) => setWeightText(event.target.value)}
      />
      {/* handleSave returns a promise; onClick wants nothing back. void says the
    promise is ignored on purpose. */}
      <button onClick={() => void handleSave()}>Save</button>
      <div>{localToday()}</div>
      <div>{message}</div>
      <div>
        {todayWeight !== null ? `${todayWeight} kg` : "No weigh in today"}
      </div>
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
