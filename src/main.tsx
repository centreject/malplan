import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyAppSettings, loadAppSettings } from "./ui/appSettings";
import { CrashScreen } from "./ui/CrashScreen";
import { reportUncaught } from "./ui/report";
import { loadScheme, loadTextSize, loadTheme, resolvedScheme } from "./ui/themes";

reportUncaught();

void applyAppSettings(loadAppSettings());

// Before the first paint, so a dark or themed window never flashes the default look. App keeps them in sync after.
const root = document.documentElement;

root.dataset["theme"] = loadTheme();

root.dataset["text"] = loadTextSize();

root.dataset["scheme"] = resolvedScheme(loadScheme(), window.matchMedia("(prefers-color-scheme: dark)").matches);

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
