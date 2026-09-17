import { useState } from "react";

function App() {
  const [weight, setWeight] = useState("");

  return (
    <>
      <h1>hello again</h1>
      <input
        value={weight}
        onChange={(event) => setWeight(event.target.value)}
      />
    </>
  );
}

export default App;
