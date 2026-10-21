import { isTauri } from "@tauri-apps/api/core";
import { error as logError } from "@tauri-apps/plugin-log";

/** Writes a problem to the app's log file (desktop only); reporting never throws. */
export function report(message: string): void {
  console.error(message);

  if (isTauri()) {
    logError(message).catch(() => undefined);
  }
}

/** Uncaught errors and rejected promises go to the log too. */
export function reportUncaught(): void {
  window.addEventListener("error", (event) => report(`${event.message} (${event.filename}:${event.lineno})`));
  window.addEventListener("unhandledrejection", (event) => report(`unhandled rejection: ${String(event.reason)}`));
}
