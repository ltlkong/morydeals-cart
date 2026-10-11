import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Platform, type LayoutChangeEvent } from "react-native";
import {
  Easing,
  ReduceMotion,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { colors } from "../theme";
import {
  dockPoints,
  DOCK_MERGE,
  DOCK_SETTLE_MS,
  GRAB_HEIGHT,
  type DockSnap,
} from "./dock-geometry";

import { useDockGesture } from "./useDockGesture";

const SETTLE = {
  duration: DOCK_SETTLE_MS,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
};
// A released drag continues at the finger's speed into its anchor; near critically damped and never past it.
const RELEASE = {
  damping: 30,
  stiffness: 320,
  mass: 1,
  overshootClamping: true,
  reduceMotion: ReduceMotion.System,
};
export function useDockSnap({
  availableHeight,
  keyboardInset,
  snap: controlled,
  onSnapChange,
  onDetent,
  reach: hostReach,
}: {
  availableHeight: number;
  keyboardInset?: number;
  snap?: DockSnap;
  onSnapChange?: (snap: DockSnap) => void;
  onDetent?: () => void;
  reach?: SharedValue<number>;
}) {
  const [current, setCurrent] = useState<DockSnap>(0);
  const snap = controlled ?? current;
  const [keyboard, setKeyboard] = useState(0);
  const inset = keyboardInset ?? keyboard;
  const [grab, setGrab] = useState(GRAB_HEIGHT);
  const [bottom, setBottom] = useState(64);
  const thread = useSharedValue(0);
  const line = useSharedValue(0);
  const bottomLift = useSharedValue(0);
  const points = useMemo(
    () => dockPoints(availableHeight, grab + bottom, inset),
    [availableHeight, grab, bottom, inset],
  );
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => setKeyboard(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboard(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  // The height the thread is animating to, so a re-render for the same anchor never restarts the motion mid-flight.
  const target = useRef(0);
  const snapTo = useCallback(
    (next: DockSnap, velocity?: number) => {
      target.current = points[next];
      thread.set(
        velocity === undefined
          ? withTiming(points[next], SETTLE)
          : withSpring(points[next], { ...RELEASE, velocity }),
      );
      setCurrent(next);
      onSnapChange?.(next);
    },
    [onSnapChange, points, thread],
  );
  useEffect(() => {
    // Anchors moved (keyboard, layout) or the host changed the snap: animate to the new height once.
    if (target.current !== points[snap]) {
      target.current = points[snap];
      thread.set(withTiming(points[snap], SETTLE));
    }
    bottomLift.set(withTiming(inset, SETTLE));
  }, [points, snap, inset, thread, bottomLift]);
  const gesture = useDockGesture({ thread, points, snap, snapTo, onDetent });
  const threadStyle = useAnimatedStyle(() => ({ height: thread.get() }));
  const fade = useSharedValue(1);
  useAnimatedReaction(
    () => thread.get() > 0,
    (opening, previous) => {
      if (opening !== previous)
        fade.set(
          withTiming(opening ? 0 : 1, {
            ...SETTLE,
            duration: opening ? 120 : 220,
          }),
        );
    },
    [fade, thread],
  );
  const lineStyle = useAnimatedStyle(() => {
    const folded = 1 - Math.min(1, thread.get() / 64);
    return { height: line.get() * folded, opacity: fade.get() };
  });
  // 0 → 1 over the last DOCK_MERGE points before the dock meets the top of its area (the host's header).
  const reachOf = (height: number) => {
    "worklet";
    return points[2] > 0
      ? Math.max(
          0,
          Math.min(1, (height - (points[2] - DOCK_MERGE)) / DOCK_MERGE),
        )
      : 0;
  };
  useAnimatedReaction(
    () => reachOf(thread.get()),
    (value) => hostReach?.set(value),
    [hostReach, points],
  );
  const dockStyle = useAnimatedStyle(() => {
    const reach = reachOf(thread.get());
    // Joined to the header: no corner and no top line between the two white bars.
    return {
      bottom: bottomLift.get(),
      borderTopLeftRadius: 28 * (1 - reach),
      borderTopRightRadius: 28 * (1 - reach),
      borderTopColor: reach > 0.5 ? colors.surface : colors.line,
    };
  });
  // Shared animated reach lets Mory fade as the dock joins the top boundary.
  const moryStyle = useAnimatedStyle(() => ({
    opacity: 1 - reachOf(thread.get()),
  }));
  const onGrabLayout = useCallback(
    (e: LayoutChangeEvent) => setGrab(Math.round(e.nativeEvent.layout.height)),
    [],
  );
  const onBottomLayout = useCallback(
    (e: LayoutChangeEvent) =>
      setBottom(Math.round(e.nativeEvent.layout.height)),
    [],
  );
  const onLineLayout = useCallback(
    (e: LayoutChangeEvent) => line.set(Math.round(e.nativeEvent.layout.height)),
    [line],
  );
  return {
    snap,
    snapTo,
    points,
    gesture,
    threadStyle,
    lineStyle,
    dockStyle,
    moryStyle,
    onGrabLayout,
    onBottomLayout,
    onLineLayout,
    inset,
  };
}
