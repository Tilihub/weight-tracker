import { createRoot } from "react-dom/client";
import App from "./App";

const element = document.getElementById("root");

if (element === null) {
  throw new Error("element is null");
}
createRoot(element).render(<App />);

// Builds only: on the dev page sw.js comes straight from public/, without
// VERSION and FILES. Below render, so nothing here can stop the app showing.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((error) => {
    console.error("Service worker registration failed:", error);
  });
}
