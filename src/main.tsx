import { createRoot } from "react-dom/client";

const element = document.getElementById("root");

if (element === null) {
  throw new Error("element is null");
}
createRoot(element).render(<h1>heyyy</h1>);
