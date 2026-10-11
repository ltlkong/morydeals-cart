import type { SharedValue } from "react-native-reanimated";
import type { DockSnap } from "./dock-geometry";
export type DockGestureOptions = {
  thread: SharedValue<number>;
  points: readonly [number, number, number];
  snap: DockSnap;
  snapTo: (snap: DockSnap, velocity?: number) => void;
  /** Called each time a drag crosses the half or full anchor (e.g. for a haptic tick). */
  onDetent?: () => void;
};
