import { memo, useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { Mory, moryEdgeAt } from "../mory/Mory";
import type { MoryPose } from "../mory/types";
import { withTiming } from "react-native-reanimated";

const SIZE = 88;
const ACTIVE_LIFT = moryEdgeAt(SIZE) - SIZE;
export type DockActivity = { id: string; state: "running" | "done" | "failed" };
export const DockMory = memo(function DockMory({
  typing,
  keystrokes,
  activity,
}: {
  typing: boolean;
  keystrokes: SharedValue<number>;
  activity?: DockActivity;
}) {
  const key = activity ? `${activity.id}:${activity.state}` : null;
  const [over, setOver] = useState<string | null>(null);
  useEffect(() => {
    if (!activity || activity.state === "running") return;
    const timer = setTimeout(() => setOver(key), 3000);
    return () => clearTimeout(timer);
  }, [activity?.state, key]);
  const reaction = !!activity && activity.state !== "running" && over !== key;
  const pose: MoryPose =
    activity?.state === "running"
      ? "scan"
      : typing
        ? "type"
        : reaction
          ? activity?.state === "done"
            ? "deals"
            : "offline"
          : "edge";
  const style = useAnimatedStyle(
    () => ({
      transform: [
        {
          translateY: withTiming(pose === "edge" ? 0 : ACTIVE_LIFT, {
            duration: 200,
            easing: Easing.out(Easing.cubic),
            reduceMotion: ReduceMotion.System,
          }),
        },
      ],
    }),
    [pose],
  );
  return (
    <Animated.View pointerEvents="none" style={[styles.mory, style]}>
      <Mory
        pose={pose}
        size={SIZE}
        keystrokes={keystrokes}
        showEffects={false}
      />
    </Animated.View>
  );
});
const styles = StyleSheet.create({
  mory: { position: "absolute", top: -moryEdgeAt(SIZE), right: 16 },
});
