import type { TextStyle } from "react-native";

/** Removes the browser focus ring from text inputs that draw their own focus border (no effect on native). */
export const NO_OUTLINE = {
  outlineStyle: "none",
  outlineWidth: 0,
} as unknown as TextStyle;
