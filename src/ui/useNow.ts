import { useEffect, useState } from "react";
import type { IsoDate } from "../domain/date";

export type Now = { today: IsoDate; minutes: number };

/** Dev only: `?now=2026-10-05T15:50` pins the clock so time-dependent states can be inspected. */
function currentDate(): Date {
  const pinned = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("now") : null;
  const date = pinned === null ? new Date() : new Date(pinned);

  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function read(): Now {
  const date = currentDate();

  const today = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

  return { today, minutes: date.getHours() * 60 + date.getMinutes() };
}

/** Local date and minute of day, re-read once per minute on the minute boundary. */
export function useNow(): Now {
  const [now, setNow] = useState(read);

  useEffect(() => {
    let timer = 0;

    const tick = () => {
      setNow(read());
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000));
    };

    timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000));

    return () => window.clearTimeout(timer);
  }, []);

  return now;
}
