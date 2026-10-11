import { useEffect, useState } from "react";

/**
 * The current time, re-rendering every `everyMs` (aligned to the clock, so countdowns turn together); `null`
 * stops ticking (nothing is counting down). Used for deal countdowns on cards and the product page.
 */
export function useNow(everyMs: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (everyMs === null) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          setNow(Date.now());
          schedule();
        },
        everyMs - (Date.now() % everyMs) + 5,
      );
    };
    setNow(Date.now());
    schedule();
    return () => clearTimeout(timer);
  }, [everyMs]);
  return now;
}
