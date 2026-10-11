import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

import type { DockNavigationItem } from "../../chat/DockNavigation";
import { Pressable } from "../../primitives/Pressable";
import { colors, fontSize, shadow } from "../../theme";
import {
  COVERAGE_FADE,
  DRAG_THRESHOLD_PX,
  PILL_DRAG_SCALE,
  PILL_SPRING,
  PRESS_MS,
  PRESS_SCALE,
  TAB_HEIGHT,
  TAB_HEIGHT_COMPACT,
  TAB_WIDTH,
  pillCoverage,
  pillLeftFor,
  scrollCompaction,
  expandedAt,
  tabIndexAt,
  tabRowWidth,
} from "./geometry";

const PADDING = 6;
/** Half the label line and its gap: moving the icon this far centres it once the label is gone. */
const LABEL_SHIFT = 7.5;
const GAP_FROM_EDGE = 12;
const GROW_MS = 100;
/** Height of the bar above its bottom offset. */
export const FLOATING_TAB_BAR_HEIGHT = TAB_HEIGHT + PADDING * 2;
/** Bottom padding a page needs so its last row clears the bar. */
export const floatingTabBarSpace = (bottomInset: number) =>
  FLOATING_TAB_BAR_HEIGHT +
  Math.max(bottomInset, GAP_FROM_EDGE) +
  GAP_FROM_EDGE;

/**
 * Drives a FloatingTabBar's `compact` from a page's scrolling, on the UI thread: pass `onScroll` to an
 * Animated.ScrollView and `compact` to the bar.
 */
export function useCompactOnScroll() {
  const compact = useSharedValue(0);
  const state = useSharedValue({ anchor: 0, compact: false });
  const offset = useSharedValue(0);
  // After a tap expands the bar, the scroll already under way (momentum) must not shrink it straight back:
  // only a new drag counts.
  const waitForDrag = useSharedValue(false);
  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: (event) => {
      waitForDrag.value = false;
      state.value = { ...state.value, anchor: event.contentOffset.y };
    },
    onScroll: (event) => {
      offset.value = event.contentOffset.y;
      if (waitForDrag.value) return;
      const next = scrollCompaction(state.value, event.contentOffset.y);
      if (next.compact && !state.value.compact)
        compact.value = withTiming(1, { duration: 200 });
      state.value = next;
    },
  });
  /** A tap on the compact bar returns it to full size; a later drag down compacts it again. */
  const expand = useCallback(() => {
    waitForDrag.value = true;
    state.value = expandedAt(offset.value);
    compact.value = withTiming(0, { duration: 200 });
  }, [state, offset, compact, waitForDrag]);
  return { compact, onScroll, expand };
}

/** One landing, started in a single UI task: the spring is the travel, the scale settles alongside. */
function land(
  left: SharedValue<number>,
  scale: SharedValue<number>,
  index: number,
) {
  "worklet";
  scale.value = withTiming(1, { duration: GROW_MS });
  left.value = withSpring(pillLeftFor(index), PILL_SPRING);
}

/**
 * A floating, rounded tab bar. The pill starts moving on the press, on the UI thread, before the host renders the
 * new page; dragging runs entirely on the UI thread; each tab's colour crossfades with how much of it the pill covers.
 */
export function FloatingTabBar({
  items,
  selectedKey,
  onSelect,
  onStep,
  bottomInset,
  compact,
  onExpand,
}: {
  items: readonly DockNavigationItem[];
  selectedKey: string;
  onSelect: (key: string) => void;
  /** A selection tick (haptics). */
  onStep?: () => void;
  bottomInset: number;
  /** 0 (full) to 1 (icons only); the host drives it from its page's scroll. */
  compact?: SharedValue<number>;
  /** A tap while compact: the bar returns to full size (the tab is still selected). */
  onExpand?: () => void;
}) {
  const full = useSharedValue(0);
  const progress = compact ?? full;
  const height = (value: number) => {
    "worklet";
    return interpolate(value, [0, 1], [TAB_HEIGHT, TAB_HEIGHT_COMPACT]);
  };
  const rowStyle = useAnimatedStyle(() => ({ height: height(progress.value) }));
  const count = items.length;
  const index = Math.max(
    0,
    items.findIndex((item) => item.key === selectedKey),
  );
  const left = useSharedValue(pillLeftFor(index));
  const scale = useSharedValue(1);
  const dragging = useSharedValue(false);
  const hovered = useSharedValue(index);
  // The tab the bar itself just moved to; its selectedKey change must not start a second, competing landing.
  const selfDriven = useRef<string | null>(null);
  const latest = useRef({ items, selectedKey, onSelect, onStep, onExpand });
  useLayoutEffect(() => {
    latest.current = { items, selectedKey, onSelect, onStep, onExpand };
  }, [items, selectedKey, onSelect, onStep, onExpand]);

  const press = useCallback(
    (at: number) => {
      const current = latest.current;
      // A tap on the compact bar brings it back to full size and still picks the tab.
      if (progress.value > 0.5) current.onExpand?.();
      const item = current.items[at];
      if (
        !item ||
        item.key === current.selectedKey ||
        item.key === selfDriven.current
      )
        return;
      current.onStep?.();
      selfDriven.current = item.key;
      scheduleOnUI(land, left, scale, at);
      // The switch happens on the press; it never waits for the pill.
      current.onSelect(item.key);
    },
    [left, scale, progress],
  );
  // A drag release has already landed the pill on the UI thread; only React needs telling.
  const commit = useCallback((at: number) => {
    const current = latest.current;
    const item = current.items[at];
    if (!item || item.key === current.selectedKey) return;
    selfDriven.current = item.key;
    current.onSelect(item.key);
  }, []);
  const step = useCallback(() => latest.current.onStep?.(), []);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(DRAG_THRESHOLD_PX)
        .onStart((event) => {
          "worklet";
          dragging.value = true;
          cancelAnimation(left);
          scale.value = withTiming(PILL_DRAG_SCALE, { duration: GROW_MS });
          hovered.value = tabIndexAt(event.x, count);
        })
        .onUpdate((event) => {
          "worklet";
          if (!dragging.value) return;
          left.value = Math.min(
            Math.max(event.x - TAB_WIDTH / 2, 0),
            pillLeftFor(count - 1),
          );
          const at = tabIndexAt(event.x, count);
          if (at !== hovered.value) {
            hovered.value = at;
            scheduleOnRN(step);
          }
        })
        .onEnd((event, success) => {
          "worklet";
          // Cancellation is settled in onFinalize instead.
          if (!success || !dragging.value) return;
          dragging.value = false;
          const at = tabIndexAt(event.x, count);
          land(left, scale, at);
          scheduleOnRN(commit, at);
        })
        .onFinalize((_event, success) => {
          "worklet";
          if (success || !dragging.value) return;
          dragging.value = false;
          land(left, scale, hovered.value);
          scheduleOnRN(commit, hovered.value);
        }),
    [count, left, scale, dragging, hovered, commit, step],
  );

  // A page change from outside the bar (a button on a page) still moves the pill.
  useEffect(() => {
    const driven = selfDriven.current === selectedKey;
    selfDriven.current = null;
    if (driven || dragging.get()) return;
    scheduleOnUI(land, left, scale, index);
  }, [selectedKey, index, left, scale, dragging]);

  // Transform only for movement, so the pill's travel never triggers layout; only the compact change resizes it.
  const pillStyle = useAnimatedStyle(() => ({
    height: height(progress.value),
    transform: [{ translateX: left.value }, { scale: scale.value }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={[s.anchor, { bottom: Math.max(bottomInset, GAP_FROM_EDGE) }]}
    >
      <View style={s.bar}>
        <GestureDetector gesture={gesture}>
          <Animated.View
            collapsable={false}
            style={[s.row, { width: tabRowWidth(count) }, rowStyle]}
          >
            <Animated.View pointerEvents="none" style={[s.pill, pillStyle]} />
            {items.map((item, at) => (
              <Tab
                key={item.key}
                item={item}
                index={at}
                left={left}
                selected={item.key === selectedKey}
                onPress={press}
                progress={progress}
              />
            ))}
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
}

/** Icon and label are drawn twice, in each colour, and crossfaded by the pill's coverage. */
const Tab = memo(function Tab({
  item,
  index,
  left,
  selected,
  onPress,
  progress,
}: {
  item: DockNavigationItem;
  index: number;
  left: SharedValue<number>;
  selected: boolean;
  onPress: (index: number) => void;
  progress: SharedValue<number>;
}) {
  // Compact: the label fades and the icon slides down to the middle of the shorter tab.
  const labelStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const shift = useAnimatedStyle(() => ({
    transform: [{ translateY: LABEL_SHIFT * progress.value }],
  }));
  const pressScale = useSharedValue(1);
  const coverage = useDerivedValue(() => pillCoverage(index, left.value));
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));
  const activeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      coverage.value,
      COVERAGE_FADE,
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));
  const inactiveStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      coverage.value,
      COVERAGE_FADE,
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));
  const label = item.title ?? item.label;
  return (
    <Pressable
      pressedScale={1}
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected }}
      onPressIn={() => {
        pressScale.set(withTiming(PRESS_SCALE, { duration: PRESS_MS }));
        onPress(index);
      }}
      onPressOut={() => pressScale.set(withTiming(1, { duration: PRESS_MS }))}
      // Screen readers activate with onPress only; the press guard ignores the repeat after a touch.
      onPress={() => onPress(index)}
      style={s.tab}
    >
      <Animated.View style={[s.content, pressStyle, shift]}>
        <View>
          <Animated.View style={inactiveStyle}>
            {item.icon(false)}
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, s.center, activeStyle]}
          >
            {item.icon(true)}
          </Animated.View>
        </View>
        <Animated.View style={labelStyle}>
          <Animated.View style={inactiveStyle}>
            <Text numberOfLines={1} style={s.label}>
              {label}
            </Text>
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, s.center, activeStyle]}
          >
            <Text numberOfLines={1} style={[s.label, { color: colors.accent }]}>
              {label}
            </Text>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
});

const s = StyleSheet.create({
  anchor: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  bar: {
    padding: PADDING,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    ...shadow.popover,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    height: TAB_HEIGHT,
  },
  pill: {
    position: "absolute",
    top: 0,
    left: 0,
    width: TAB_WIDTH,
    height: TAB_HEIGHT,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
  },
  tab: {
    width: TAB_WIDTH,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  content: { alignItems: "center", gap: 2 },
  center: { alignItems: "center", justifyContent: "center" },
  label: { fontSize: fontSize.tab, fontWeight: "700", color: colors.ink },
});
