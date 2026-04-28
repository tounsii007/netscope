"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";

/**
 * Live clock showing the current time at the looked-up IP's timezone.
 *
 * Re-renders every 30 s so the minute display stays fresh without burning
 * CPU. Hidden if the timezone is missing or invalid for the runtime
 * (Intl.DateTimeFormat throws RangeError on unknown TZ identifiers).
 */
export function LocalTime({ tz }: { tz?: string }) {
  const locale = useLocale();
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!tz) return null;
  try {
    const fmt = new Intl.DateTimeFormat(locale, {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
    return <span className="font-mono">{fmt.format(new Date())}</span>;
  } catch {
    return null;
  }
}
