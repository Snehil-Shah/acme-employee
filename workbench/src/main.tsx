import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles.css";

// No StrictMode: its double-mount in development would open every agent
// stream twice, and each stream is a paid model call.
createRoot(document.getElementById("root")!).render(<App />);
