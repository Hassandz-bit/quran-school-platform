import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerPwaServiceWorker } from "@/lib/pwa";

registerPwaServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
