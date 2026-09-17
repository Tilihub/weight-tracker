import { createRoot } from "react-dom/client";
import App from "./App";

const element = document.getElementById("root");

if (element === null) {
  throw new Error("element is null");
}
createRoot(element).render(<App />);
