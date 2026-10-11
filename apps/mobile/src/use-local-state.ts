import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
const saveError = "Could not save changes on this device.";
/** Hydration precedes edits; writes are serialized so older snapshots cannot win. */
export function useLocalState<T>(
  key: string,
  initial: T,
  validate: (value: unknown) => value is T,
) {
  const [value, setValue] = useState(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const writes = useRef(Promise.resolve());
  // Stays false when storage could not be read, so a failed read never overwrites saved data.
  const persist = useRef(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(key)
      .then(async (raw) => {
        if (!active) return;
        let saved: unknown = undefined;
        try {
          saved = raw ? JSON.parse(raw) : undefined;
        } catch {}
        if (raw && !validate(saved)) {
          // Keep the unreadable copy aside and start fresh instead of blocking the app.
          await AsyncStorage.setItem(`${key}.corrupt`, raw).catch(() => {});
          if (active) setError("Some saved items could not be restored.");
        } else if (raw) setValue(saved as T);
        persist.current = true;
      })
      .catch(() => {
        if (active)
          setError(
            "Could not open saved items. Changes will not be kept until you restart the app.",
          );
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [key, validate]);
  useEffect(() => {
    if (!ready || !persist.current) return;
    writes.current = writes.current
      .then(() => AsyncStorage.setItem(key, JSON.stringify(value)))
      .then(() => setError((e) => (e === saveError ? "" : e)))
      .catch(() => setError(saveError));
  }, [key, value, ready]);
  return { value, setValue, ready, error };
}
