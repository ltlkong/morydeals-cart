import { colors } from "./tokens";

/** Mory's own colours, taken from the mascot artwork; the tag uses the app's accent. */
export const MORY_COLORS = {
  body: "#FFFFFF",
  outline: "#111111",
  eye: "#111111",
  cheek: "#F6B8AE",
  orange: "#FFBA27",
  orangeShine: "#FFE39B",
  leaf: "#73D950",
  stem: "#6B3F1D",
  tag: colors.accent,
  tagInk: colors.onAccent,
  /** The ledge Mory peeks over. */
  ledge: colors.accentSoft,
  /** The empty box Mory holds out (empty states). */
  box: "#F2D3AE",
  boxInside: "#C99A6B",
  /** The unplugged cable (error states). */
  cable: "#6F6760",
  spark: "#FFC53D",
} as const;
