import { useState, useEffect } from "react";
import { addWeight, getWeight } from "./db";

function localToday() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function App() {
  const [weightText, setWeightText] = useState("");
  const [todayWeight, setTodayWeight] = useState<number | null>(null);

  useEffect(() => {
    getWeight(localToday())
      .then((record) => setTodayWeight(record?.weight ?? null))
      .catch((error) => console.log(error));
  }, []);

  async function handleSave() {
    const input = weightText.trim();
    if (input === "") {
      console.log("enter a weight");
      return;
    }

    const weight = Number(input);
    const date = localToday();

    try {
      const record = await addWeight(date, weight);
      setTodayWeight(record.weight);
    } catch (error) {
      console.log(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <>
      <h1>hello again</h1>
      <input
        value={weightText}
        onChange={(event) => setWeightText(event.target.value)}
      />
      <button onClick={handleSave}>Save</button>
      <div>{localToday()}</div>
      <div>
        {todayWeight !== null
          ? `Today's weigh in is ${todayWeight}`
          : "No weigh in today"}
      </div>
    </>
  );
}

export default App;
