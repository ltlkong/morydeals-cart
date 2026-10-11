import type { LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ReduceMotion,
  ZoomIn,
  ZoomOut,
} from "react-native-reanimated";

import { Mory } from "../mory/Mory";
import { Pressable } from "../primitives/Pressable";
import { colors, radius, shadow, space } from "../theme/tokens";
import { font } from "../theme/typography";

export type MoryFabAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  /** accent: the page's main action, in brand red. */
  tone?: "default" | "accent";
  disabled?: boolean;
};

type Props = {
  /** Listed bottom to top: the first sits nearest Mory, so put the most used action first. */
  actions: readonly MoryFabAction[];
  /** Spoken labels of Mory while the dial is closed and open. */
  label: string;
  closeLabel: string;
  /** The device's bottom safe area; the button keeps clear of it. */
  bottomInset?: number;
  /** Called on every press of Mory or an action; the host decides on haptics. */
  onTap?: () => void;
};

const FAB = 76;
const ACTION = 48;
/** Each circle pops up in turn, the one nearest Mory first, 50 ms apart; they shrink away together. */
const pop = (fromMory: number) =>
  ZoomIn.delay(fromMory * 50)
    .duration(220)
    .easing(Easing.out(Easing.back(1.8)))
    .reduceMotion(ReduceMotion.System);
const away = ZoomOut.duration(140).reduceMotion(ReduceMotion.System);

/**
 * Mory, floating on its own in the bottom-right corner, that opens a speed dial: the page's actions pop up above it as round
 * buttons, each named beside it. Choosing one, tapping Mory again or tapping anywhere else puts them away. Place it
 * last inside a full-screen container so it floats over the content.
 */
export function MoryFab({
  actions,
  label,
  closeLabel,
  bottomInset = 0,
  onTap,
}: Props) {
  const [open, setOpen] = useState(false);
  // Sits well above the home indicator and the store's own bottom bars.
  const bottom = Math.max(bottomInset, space.lg) + space.sm + 40;
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {open ? (
        <Animated.View
          entering={FadeIn.duration(140)}
          exiting={FadeOut.duration(140)}
          style={StyleSheet.absoluteFill}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            pressedScale={1}
            onPress={() => setOpen(false)}
            style={[StyleSheet.absoluteFill, styles.scrim]}
          />
        </Animated.View>
      ) : null}
      <View pointerEvents="box-none" style={[styles.corner, { bottom }]}>
        {open
          ? [...actions].reverse().map((action, index) => (
              <Animated.View
                key={action.id}
                entering={pop(actions.length - index)}
                exiting={away}
                style={styles.item}
              >
                <View pointerEvents="none" style={styles.name}>
                  <Text style={styles.nameText} numberOfLines={1}>
                    {action.label}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  accessibilityState={{ disabled: !!action.disabled }}
                  disabled={action.disabled}
                  onPress={() => {
                    onTap?.();
                    setOpen(false);
                    action.onPress();
                  }}
                  style={[
                    styles.action,
                    action.tone === "accent" && styles.accent,
                    action.disabled && styles.disabled,
                  ]}
                >
                  <action.icon
                    size={21}
                    color={
                      action.disabled
                        ? colors.faint
                        : action.tone === "accent"
                          ? colors.onAccent
                          : colors.ink
                    }
                    strokeWidth={2.3}
                  />
                </Pressable>
              </Animated.View>
            ))
          : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? closeLabel : label}
          accessibilityState={{ expanded: open }}
          onPress={() => {
            onTap?.();
            setOpen((value) => !value);
          }}
          style={styles.fab}
        >
          {/* The price-tag pose bobs as it floats over the page. */}
          <Mory size={72} pose="tag" live showEffects={false} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: "rgba(20,15,12,0.18)" },
  corner: {
    position: "absolute",
    right: space.lg,
    alignItems: "flex-end",
    gap: space.md,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginRight: (FAB - ACTION) / 2,
  },
  name: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  nameText: { fontFamily: font.bold, fontSize: 14, color: colors.ink },
  action: {
    width: ACTION,
    height: ACTION,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.floating,
  },
  accent: { backgroundColor: colors.accent, borderColor: colors.accent },
  disabled: { backgroundColor: colors.surfaceSunken, borderColor: colors.line },
  // Mory itself is the button: no disc behind it, only a finger-sized touch area.
  fab: {
    width: FAB,
    height: FAB,
    alignItems: "center",
    justifyContent: "center",
  },
});
