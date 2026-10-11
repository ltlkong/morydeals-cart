import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

// Shared components call haptics through here; the web has no haptic engine, so calls resolve immediately.
export { ImpactFeedbackStyle, NotificationFeedbackType } from "expo-haptics";

const native = Platform.OS === "ios" || Platform.OS === "android";

export function selectionAsync(): Promise<void> {
  return native ? Haptics.selectionAsync() : Promise.resolve();
}

export function impactAsync(
  style?: Haptics.ImpactFeedbackStyle,
): Promise<void> {
  return native ? Haptics.impactAsync(style) : Promise.resolve();
}

export function notificationAsync(
  type?: Haptics.NotificationFeedbackType,
): Promise<void> {
  return native ? Haptics.notificationAsync(type) : Promise.resolve();
}
