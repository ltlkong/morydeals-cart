import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Keyboard,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { SquarePen } from "lucide-react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Pressable } from "../primitives/Pressable";
import { IconButton } from "../actions/IconButton";
import { colors, space } from "../theme";
import { DockInput } from "./DockInput";
import { DockThread, type ChatMessage } from "./DockThread";
import { DockMory, type DockActivity } from "./DockMory";
import { useDockSnap } from "./useDockSnap";
import { GRAB_HEIGHT, type DockSnap } from "./dock-geometry";
export type { ChatMessage } from "./DockThread";
export type { DockSnap } from "./dock-geometry";
export type { DockActivity } from "./DockMory";

export type AssistantDockProps = {
  messages: ChatMessage[];
  onSend: (text: string) => boolean | void;
  onRestart?: () => void;
  availableHeight?: number;
  bottomInset?: number;
  /** Optional host/preview keyboard geometry; otherwise uses native keyboard events. */
  keyboardInset?: number;
  snap?: DockSnap;
  onSnapChange?: (snap: DockSnap) => void;
  suggestions?: string[];
  welcome?: ReactNode;
  placeholder?: string;
  actionLine?: ReactNode;
  leadingAction?: ReactNode;
  leadingActionWidth?: number;
  activity?: DockActivity;
  /** Called each time a drag crosses the half or full anchor; the host decides on haptics. */
  onDetent?: () => void;
  /** Written 0 → 1 as the dock meets the top of its area, so a header can square its corners to join it. */
  reach?: SharedValue<number>;
};
/** Bottom-anchored dock with the old folded / half / full geometry. Place inside a bounded relative container. */
export function AssistantDock({
  messages,
  onSend,
  onRestart,
  availableHeight,
  bottomInset = 0,
  keyboardInset,
  snap: controlled,
  onSnapChange,
  suggestions = [],
  welcome,
  placeholder = "Paste a link or ask Mory…",
  actionLine,
  leadingAction,
  leadingActionWidth = 44,
  activity,
  onDetent,
  reach,
}: AssistantDockProps) {
  const { height } = useWindowDimensions();
  const dock = useDockSnap({
    availableHeight: availableHeight ?? height,
    keyboardInset,
    snap: controlled,
    onSnapChange,
    onDetent,
    reach,
  });
  const [focused, setFocused] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const nav = useSharedValue(1);
  const keystrokes = useSharedValue(0);
  const navigating = !focused && !hasDraft;
  useEffect(() => {
    nav.set(
      withTiming(navigating ? 1 : 0, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [nav, navigating]);
  const navStyle = useAnimatedStyle(() => ({
    width: (leadingActionWidth + 4) * nav.get(),
    opacity: nav.get(),
  }));
  const onFocused = useCallback(
    (now: boolean) => {
      setFocused(now);
      // Typing opens the conversation fully; the full anchor already sits above the keyboard.
      if (now && dock.snap !== 2) dock.snapTo(2);
    },
    [dock.snap, dock.snapTo],
  );
  const send = useCallback(
    (text: string) => {
      if (onSend(text) === false) return false;
      if (dock.snap === 0) dock.snapTo(1);
      return true;
    },
    [onSend, dock.snap, dock.snapTo],
  );
  const change = (next: DockSnap) => {
    if (!next) Keyboard.dismiss();
    dock.snapTo(next);
  };
  return (
    <Animated.View style={[styles.dock, dock.dockStyle]}>
      <Animated.View pointerEvents="none" style={dock.moryStyle}>
        <DockMory
          typing={focused && hasDraft}
          keystrokes={keystrokes}
          activity={activity}
        />
      </Animated.View>
      {/* The handle sits close to the bar; hitSlop keeps the drag target finger-sized. */}
      <View
        {...dock.gesture.handlers}
        {...(Platform.OS === "web"
          ? ({ style: { touchAction: "none" } } as object)
          : {})}
        hitSlop={GRAB_SLOP}
        onLayout={dock.onGrabLayout}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            dock.snap === 0 ? "Expand Mory chat" : "Collapse Mory chat"
          }
          accessibilityActions={[
            { name: "increment", label: "Expand" },
            { name: "decrement", label: "Collapse" },
          ]}
          onAccessibilityAction={(event) =>
            change(
              Math.max(
                0,
                Math.min(
                  2,
                  dock.snap +
                    (event.nativeEvent.actionName === "increment" ? 1 : -1),
                ),
              ) as DockSnap,
            )
          }
          {...({
            onKeyDown: (event: { key: string; preventDefault: () => void }) => {
              if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                change(
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 2
                      : (Math.max(
                          0,
                          Math.min(
                            2,
                            dock.snap + (event.key === "ArrowUp" ? 1 : -1),
                          ),
                        ) as DockSnap),
                );
              }
            },
          } as object)}
          onPress={() => {
            if (dock.gesture.canTap()) change(dock.snap === 0 ? 1 : 0);
          }}
          style={styles.grab}
        >
          <View style={styles.handle} />
        </Pressable>
      </View>
      {dock.snap > 0 && onRestart && (
        <View style={styles.restart}>
          <IconButton
            label="Start a new chat"
            onPress={onRestart}
            style={{ width: 30, height: 30 }}
          >
            <SquarePen size={16} color={colors.muted} />
          </IconButton>
        </View>
      )}
      <Animated.View
        accessibilityElementsHidden={dock.snap === 0}
        importantForAccessibility={
          dock.snap === 0 ? "no-hide-descendants" : "auto"
        }
        aria-hidden={dock.snap === 0}
        pointerEvents={dock.snap === 0 ? "none" : "auto"}
        style={[styles.thread, dock.threadStyle]}
      >
        <DockThread
          messages={messages}
          welcome={welcome}
          suggestions={suggestions}
          onSend={send}
          height={dock.points[2]}
          visible={dock.points[dock.snap]}
        />
      </Animated.View>
      <Animated.View
        accessibilityElementsHidden={dock.snap !== 0}
        importantForAccessibility={
          dock.snap !== 0 ? "no-hide-descendants" : "auto"
        }
        aria-hidden={dock.snap !== 0}
        pointerEvents={dock.snap === 0 ? "box-none" : "none"}
        style={[styles.lineArea, dock.lineStyle]}
      >
        <View onLayout={dock.onLineLayout} style={styles.lineRoom}>
          {actionLine}
        </View>
      </Animated.View>
      <View
        onLayout={dock.onBottomLayout}
        style={[
          styles.bottom,
          { paddingBottom: Math.max(bottomInset, space.sm) },
        ]}
      >
        <View style={styles.bar}>
          {leadingAction ? (
            <Animated.View
              accessibilityElementsHidden={!navigating}
              importantForAccessibility={
                !navigating ? "no-hide-descendants" : "auto"
              }
              aria-hidden={!navigating}
              pointerEvents={navigating ? "auto" : "none"}
              style={[styles.leading, navStyle]}
            >
              {leadingAction}
            </Animated.View>
          ) : null}
          <DockInput
            onSend={send}
            onFocused={onFocused}
            onHasDraft={setHasDraft}
            keystrokes={keystrokes}
            placeholder={placeholder}
          />
        </View>
      </View>
    </Animated.View>
  );
}
const GRAB_SLOP = { top: 14, bottom: 4 };
const styles = StyleSheet.create({
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  grab: { height: GRAB_HEIGHT, alignItems: "center", justifyContent: "center" },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.lineStrong,
  },
  restart: { position: "absolute", right: 12, top: 1 },
  thread: { overflow: "hidden" },
  lineArea: { overflow: "hidden" },
  lineRoom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 8,
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  bottom: { paddingTop: space.xs },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: space.md,
  },
  leading: { overflow: "hidden" },
});
