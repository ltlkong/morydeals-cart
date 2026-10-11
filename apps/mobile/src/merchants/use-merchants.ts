import { AppState } from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { getMerchants, type MerchantCatalog } from "./merchants-api";
import { userMessage } from "../errors";
/** Loads the store catalog, again when the app returns to the foreground; `reload` resolves once it has loaded. */
export function useMerchants() {
  const [catalog, setCatalog] = useState<MerchantCatalog | null>(null);
  const [error, setError] = useState("");
  const current = useRef<AbortController | null>(null);
  const reload = useCallback(() => {
    current.current?.abort();
    const abort = new AbortController();
    current.current = abort;
    setError("");
    return getMerchants(abort.signal)
      .then(setCatalog)
      .catch((e) => {
        if (!abort.signal.aborted)
          setError(userMessage(e, "Could not load stores. Please try again."));
      });
  }, []);
  useEffect(() => {
    void reload();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void reload();
    });
    return () => {
      subscription.remove();
      current.current?.abort();
    };
  }, [reload]);
  return { catalog, error, reload };
}
