import { useCallback, useRef, useState } from "react";
import { RefreshControl, type RefreshControlProps } from "react-native";

import { atLeast } from "../lib/at-least";
import { colors } from "../theme/tokens";

/** A refresh keeps its spinner at least this long, so a fast reload still reads as one. */
export const MIN_REFRESH_MS = 1000;

/** The shared native pull-to-refresh control in the app's accent ink. */
export function PullToRefresh(
  props: Pick<
    RefreshControlProps,
    "refreshing" | "onRefresh" | "progressViewOffset"
  >,
) {
  return (
    <RefreshControl
      tintColor={colors.accentInk}
      colors={[colors.accentInk]}
      {...props}
    />
  );
}

/**
 * Pull-to-refresh state: `refreshing` stays on until `reload` settles and MIN_REFRESH_MS have passed. Pulls during a
 * refresh are ignored, so one gesture never starts overlapping reloads.
 */
export function useMinimumRefresh(reload: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);
  const refresh = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    void atLeast(reload(), MIN_REFRESH_MS).then(() => {
      busy.current = false;
      setRefreshing(false);
    });
  }, [reload]);
  return { refreshing, refresh };
}
