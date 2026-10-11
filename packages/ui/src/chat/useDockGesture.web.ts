import { useEffect, useRef, type PointerEvent } from "react";
import { dockLevel, nearestDockSnap } from "./dock-geometry";
import type { DockGestureOptions } from "./dock-gesture";
/** Window listeners retain the gesture when a moving handle leaves the pointer. */
export function useDockGesture({
  thread,
  points,
  snap,
  snapTo,
  onDetent,
}: DockGestureOptions) {
  const drag = useRef<{
    startY: number;
    height: number;
    lastY: number;
    time: number;
    velocity: number;
    moved: boolean;
    level: number;
  } | null>(null);
  const dragged = useRef(false);
  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      const delta = event.clientY - current.startY;
      if (Math.abs(delta) > 6) current.moved = dragged.current = true;
      if (!current.moved) return;
      event.preventDefault();
      const dt = event.timeStamp - current.time;
      current.velocity =
        dt >= 8 ? ((event.clientY - current.lastY) * 1000) / dt : 0;
      current.lastY = event.clientY;
      current.time = event.timeStamp;
      const height = Math.max(0, Math.min(points[2], current.height - delta));
      thread.set(height);
      const level = dockLevel(height, points);
      if (level !== current.level) {
        current.level = level;
        onDetent?.();
      }
    };
    const end = () => {
      const current = drag.current;
      drag.current = null;
      if (current?.moved)
        snapTo(
          nearestDockSnap(thread.get(), current.velocity, points),
          -current.velocity,
        );
    };
    const cancel = () => {
      if (drag.current) {
        drag.current = null;
        snapTo(snap);
      }
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [thread, points, snap, snapTo, onDetent]);
  return {
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        dragged.current = false;
        drag.current = {
          startY: event.clientY,
          height: thread.get(),
          lastY: event.clientY,
          time: event.timeStamp,
          velocity: 0,
          moved: false,
          level: dockLevel(thread.get(), points),
        };
      },
    },
    canTap: () => !dragged.current,
  };
}
