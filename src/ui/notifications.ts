import { isTauri } from "@tauri-apps/api/core";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { useEffect, useRef } from "react";
import * as v from "valibot";
import type { Item } from "../domain/item";
import { dueReminders } from "../domain/reminders";
import type { Now } from "./useNow";

const SettingsSchema = v.object({
  enabled: v.optional(v.boolean(), false),
  lead: v.optional(v.number(), 10),
});

export type NotificationSettings = v.InferOutput<typeof SettingsSchema>;

const SETTINGS_KEY = "malplan.notifications";

const SENT_KEY = "malplan.sentReminders";

export function loadNotificationSettings(): NotificationSettings {
  try {
    const parsed = v.safeParse(SettingsSchema, JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "{}"));

    return parsed.success ? parsed.output : { enabled: false, lead: 10 };
  } catch {
    return { enabled: false, lead: 10 };
  }
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable: the setting lasts for this session only.
  }
}

/** Ask the OS (or browser) for permission. Returns whether notifications may be shown. */
export async function ensurePermission(): Promise<boolean> {
  if (isTauri()) {
    return (await isPermissionGranted()) || (await requestPermission()) === "granted";
  }

  if (!("Notification" in window)) {
    return false;
  }

  return Notification.permission === "granted" || (await Notification.requestPermission()) === "granted";
}

export function notify(title: string, body: string): void {
  if (isTauri()) {
    sendNotification({ title, body });
  } else if ("Notification" in window && Notification.permission === "granted") {
    const shown = new Notification(title, { body });

    shown.addEventListener("click", () => window.focus());
  }
}

/** Keys already fired, kept for two days so a restart never repeats a reminder. */
function loadSent(): Set<string> {
  try {
    const parsed = v.safeParse(v.array(v.string()), JSON.parse(window.localStorage.getItem(SENT_KEY) ?? "[]"));

    return new Set(parsed.success ? parsed.output : []);
  } catch {
    return new Set();
  }
}

function saveSent(sent: Set<string>, today: string): void {
  // Keys end with "@YYYY-MM-DD"; keep today's and later.
  const kept = [...sent].filter((key) => (key.split("@").at(-1) ?? "") >= today);

  try {
    window.localStorage.setItem(SENT_KEY, JSON.stringify(kept));
  } catch {
    // Storage unavailable: worst case a reminder repeats after a restart.
  }
}

/** Fires reminders as the clock passes them. Checks once per minute via `now`. */
export function useReminders(items: Item[], now: Now, settings: NotificationSettings): void {
  const last = useRef<Now | undefined>(undefined);

  useEffect(() => {
    const previous = last.current;

    last.current = now;

    if (!settings.enabled) {
      return;
    }

    // On start or a new day, look back one minute only: never replay a whole morning at once.
    const from = previous?.today === now.today ? previous.minutes : now.minutes - 1;
    const sent = loadSent();
    const due = dueReminders(items, now.today, from, now.minutes, settings.lead).filter((r) => !sent.has(r.key));

    for (const reminder of due) {
      notify(reminder.title, reminder.body);
      sent.add(reminder.key);
    }

    if (due.length > 0) {
      saveSent(sent, now.today);
    }
  }, [items, now, settings]);
}
