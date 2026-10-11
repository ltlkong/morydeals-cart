import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Pressable } from "../primitives/Pressable";
import { colors } from "../theme";
const SIZE = 44;
const GAP = 4;
const STEP = SIZE + GAP;
// Close to critically damped: settles in about 0.2 s without a slow tail.
const SPRING = {
  damping: 36,
  stiffness: 560,
  reduceMotion: ReduceMotion.System,
};
export type DockNavigationItem = {
  key: string;
  /** Accessibility label; also the visible label unless `title` is given. */
  label: string;
  /** Short visible label for tab bars. */
  title?: string;
  icon: (selected: boolean) => ReactNode;
};
export function dockNavigationWidth(count: number) {
  return count * SIZE + Math.max(0, count - 1) * GAP;
}
/** Controlled presentation only: the host owns routes, selection and optional haptics. */
export function DockNavigation({
  items,
  selectedKey,
  onSelect,
  onStep,
}: {
  items: readonly DockNavigationItem[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onStep?: () => void;
}) {
  const index = items.findIndex((item) => item.key === selectedKey);
  const ref = useRef<View>(null);
  const origin = useRef(0);
  const dragging = useRef(false);
  const hovered = useRef(index);
  const left = useSharedValue(Math.max(0, index) * STEP);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(index < 0 ? 0 : 1);
  useEffect(() => {
    if (!dragging.current) {
      left.set(withSpring(Math.max(0, index) * STEP, SPRING));
      opacity.set(
        withTiming(index < 0 ? 0 : 1, {
          duration: 140,
          reduceMotion: ReduceMotion.System,
        }),
      );
    }
  }, [index, left, opacity]);
  const gesture = useMemo(() => {
    const move = (x: number) => {
      const position = Math.min(
        Math.max(0, items.length - 1) * STEP,
        Math.max(0, x - origin.current - SIZE / 2),
      );
      left.set(position);
      const at = Math.round(position / STEP);
      if (at !== hovered.current) {
        hovered.current = at;
        onStep?.();
      }
    };
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) =>
        Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: (_, g) => {
        dragging.current = true;
        opacity.set(1);
        scale.set(withSpring(1.08, SPRING));
        move(g.moveX);
      },
      onPanResponderMove: (_, g) => move(g.moveX),
      onPanResponderRelease: () => {
        dragging.current = false;
        scale.set(withSpring(1, SPRING));
        const item = items[hovered.current];
        if (item) {
          left.set(withSpring(hovered.current * STEP, SPRING));
          onSelect(item.key);
        }
      },
      onPanResponderTerminate: () => {
        dragging.current = false;
        scale.set(withSpring(1, SPRING));
        left.set(withSpring(Math.max(0, index) * STEP, SPRING));
      },
    });
  }, [items, index, left, scale, opacity, onSelect, onStep]);
  const pill = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateX: left.get() }, { scale: scale.get() }],
  }));
  return (
    <View
      ref={ref}
      onLayout={() =>
        ref.current?.measureInWindow((x) => {
          origin.current = x;
        })
      }
      {...gesture.panHandlers}
      style={[s.row, { width: dockNavigationWidth(items.length) }]}
    >
      <Animated.View pointerEvents="none" style={[s.pill, pill]} />
      {items.map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          accessibilityState={{ selected: item.key === selectedKey }}
          onPress={() => {
            if (!dragging.current) {
              if (item.key !== selectedKey) onStep?.();
              // Move now; the host re-renders its new page before `selectedKey` changes.
              left.set(withSpring(items.indexOf(item) * STEP, SPRING));
              onSelect(item.key);
            }
          }}
          style={s.item}
        >
          {item.icon(item.key === selectedKey)}
        </Pressable>
      ))}
    </View>
  );
}
const s = StyleSheet.create({
  row: { flexDirection: "row", gap: GAP },
  item: {
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    position: "absolute",
    width: SIZE,
    height: SIZE,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
  },
});
