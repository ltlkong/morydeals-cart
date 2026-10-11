import type { SharedValue } from "react-native-reanimated";
import type { MoryHolding } from "./held";

export type MoryPose =
  | "mascot"
  | "scan"
  | "peek"
  | "edge"
  | "deals"
  | "wave"
  | "love"
  | "tag"
  | "welcome"
  | "type"
  | "empty"
  | "offline"
  | "alert"
  | "drop"
  | "bought"
  | "search";
export type MoryHeadpiece =
  "orange" | "apple" | "pear" | "cherry" | "lemon" | "none";
/** `starry` is for a great deal; `worried` is for scenes (errors, no results), not a shopper's everyday look. */
export type MoryExpression =
  "neutral" | "happy" | "wink" | "sleepy" | "starry" | "worried";
export type MoryHandMotion = "hold" | "wave" | "tap";
export type MoryMotion = {
  body?: "bob" | "still";
  eyes?: "blink" | "still";
  headpiece?: "sway" | "still";
  hands?: MoryHandMotion;
  prop?: "animate" | "still";
  durationMs?: number;
};
export type MoryProps = {
  size: number;
  pose?: MoryPose;
  holding?: MoryHolding;
  headpiece?: MoryHeadpiece;
  expression?: MoryExpression;
  motion?: MoryMotion;
  clock?: SharedValue<number>;
  still?: boolean;
  live?: boolean;
  showEffects?: boolean;
  dropIn?: boolean;
  sign?: string;
  keystrokes?: SharedValue<number>;
};
export type { MoryHolding } from "./held";
