import { UserFacingError } from "./errors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { baseUrl } from "./api-base";

// This device's anonymous identity until sign-in links it to an account. Native keeps it in the keychain.
const KEY = "mory.deviceToken";
const store =
  Platform.OS === "web"
    ? {
        get: () => AsyncStorage.getItem(KEY),
        set: (value: string) => AsyncStorage.setItem(KEY, value),
        clear: () => AsyncStorage.removeItem(KEY),
      }
    : {
        get: () => SecureStore.getItemAsync(KEY),
        set: (value: string) => SecureStore.setItemAsync(KEY, value),
        clear: () => SecureStore.deleteItemAsync(KEY),
      };
let current: Promise<string> | undefined;

/** The saved token, registering this device once if there is none (concurrent callers share one request). */
function deviceToken(): Promise<string> {
  current ??= (async () => {
    const saved = await store.get().catch(() => null);
    if (saved) return saved;
    const response = await fetch(`${baseUrl}/anonymous-users`, {
      method: "POST",
    });
    if (!response.ok)
      throw new UserFacingError(
        "Mory is temporarily unavailable. Please try again.",
      );
    const { token } = (await response.json()) as { token?: unknown };
    if (typeof token !== "string")
      throw new UserFacingError(
        "Mory sent an unexpected reply. Please try again.",
      );
    await store.set(token).catch(() => undefined);
    return token;
  })().catch((error) => {
    current = undefined;
    throw error;
  });
  return current;
}

/** fetch with this device's bearer token; an unknown token (e.g. a reset server) re-registers once. */
export async function authorizedFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const send = async () =>
    fetch(url, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${await deviceToken()}`,
      },
    });
  const response = await send();
  if (response.status !== 401) return response;
  current = undefined;
  await store.clear().catch(() => undefined);
  return send();
}
