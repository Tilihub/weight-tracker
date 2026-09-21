import { useState, useEffect } from "react";
import { addWeight, getWeight } from "./db";

function localToday() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function errorToString(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function App() {
  const [weightText, setWeightText] = useState("");
  const [todayWeight, setTodayWeight] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getWeight(localToday())
      .then((record) => setTodayWeight(record?.weight ?? null))
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
      <button onClick={() => void handleSave()}>Save</button>
      <div>{localToday()}</div>
      <div>{message}</div>
      <div>
        {todayWeight !== null ? `${todayWeight} kg` : "No weigh in today"}
      </div>
    </>
  );
}

export default App;
