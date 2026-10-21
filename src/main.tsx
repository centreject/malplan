import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyAppSettings, loadAppSettings } from "./ui/appSettings";
import { CrashScreen } from "./ui/CrashScreen";

void applyAppSettings(loadAppSettings());

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("index.html is missing the #root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <CrashScreen>
      <App />
    </CrashScreen>
  </StrictMode>,
);
