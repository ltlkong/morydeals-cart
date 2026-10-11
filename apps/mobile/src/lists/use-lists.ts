import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { addToList, createList, getLists, type ListSummary } from "./lists-api";
import { userMessage } from "../errors";

/** Lists kept on this device before they moved to the server. */
const LOCAL = "mory.lists.v1";
const MIGRATED = "mory.lists.migrated.v1";
type LocalList = { name?: unknown; urls?: unknown };

/** Once per device: move lists saved on the phone to the server, then forget the local copy. */
async function migrateLocalLists() {
  if (await AsyncStorage.getItem(MIGRATED).catch(() => "1")) return;
  const raw = await AsyncStorage.getItem(LOCAL).catch(() => null);
  const local: LocalList[] = (() => {
    try {
      const value: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  })();
  for (const list of local) {
    if (typeof list.name !== "string" || !list.name.trim()) continue;
    const id = await createList(list.name.trim().slice(0, 60)).catch(
      () => null,
    );
    if (!id) continue;
    for (const url of Array.isArray(list.urls) ? list.urls : [])
      if (typeof url === "string")
        await addToList(id, url).catch(() => undefined);
  }
  await AsyncStorage.setItem(MIGRATED, "1").catch(() => undefined);
  await AsyncStorage.removeItem(LOCAL).catch(() => undefined);
}

/** This device's lists from the server: the overview the Lists page and pickers share. */
export function useLists() {
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const migrated = useRef<Promise<void> | null>(null);
  const reload = useCallback(async () => {
    try {
      migrated.current ??= migrateLocalLists();
      await migrated.current;
      setLists(await getLists());
      setError("");
    } catch (failure) {
      setError(userMessage(failure, "Could not load your lists."));
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { lists, ready, error, reload };
}
