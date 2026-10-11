import { useMemo, useRef } from "react";
import { PanResponder } from "react-native";
import { dockLevel, nearestDockSnap } from "./dock-geometry";
import type { DockGestureOptions } from "./dock-gesture";
export function useDockGesture({
  thread,
  points,
  snap,
  snapTo,
  onDetent,
}: DockGestureOptions) {
  const start = useRef(0);
  const level = useRef(0);
  const dragged = useRef(false);
  const gesture = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => {
          dragged.current = false;
          return false;
        },
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          start.current = thread.get();
          level.current = dockLevel(start.current, points);
          dragged.current = true;
        },
        onPanResponderMove: (_, g) => {
          const height = Math.min(points[2], Math.max(0, start.current - g.dy));
          thread.set(height);
          const next = dockLevel(height, points);
          if (next !== level.current) {
            level.current = next;
            onDetent?.();
          }
        },
        // vy is downward px/ms; the thread height grows upward in px/s.
        onPanResponderRelease: (_, g) =>
          snapTo(
            nearestDockSnap(thread.get(), g.vy * 1000, points),
            -g.vy * 1000,
          ),
        onPanResponderTerminate: () => snapTo(snap),
      }),
    [points, snap, snapTo, thread, onDetent],
  );
  return { handlers: gesture.panHandlers, canTap: () => !dragged.current };
}
