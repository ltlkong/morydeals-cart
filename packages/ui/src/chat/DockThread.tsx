import { memo, useRef, type ReactNode } from "react";
import { Platform, ScrollView, View, StyleSheet } from "react-native";
import { Copy } from "../content/Copy";
import { Chip } from "../inputs/Chip";
import { colors, radius, space } from "../theme";
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  content?: ReactNode;
};
type Props = {
  messages: ChatMessage[];
  welcome?: ReactNode;
  suggestions: string[];
  onSend: (text: string) => boolean | void;
  /** The fully open thread height: the conversation is always laid out at this size. */
  height: number;
  /** The settled visible height; the dock clips the rest from the top. */
  visible: number;
};
/**
 * Laid out once at the full open height and anchored to the input bar, so dragging the dock only reveals or hides
 * it: no relayout, no content-size change, no automatic scrolling while the dock moves.
 */
export const DockThread = memo(function DockThread({
  messages,
  welcome,
  suggestions,
  onSend,
  height,
  visible,
}: Props) {
  const scroll = useRef<ScrollView>(null);
  // iOS: the clipped top becomes scrollable range (an inset, not a relayout), so the first messages stay reachable.
  const hidden = Platform.OS === "ios" ? Math.max(0, height - visible) : 0;
  return (
    <ScrollView
      ref={scroll}
      style={[styles.frame, { height }]}
      contentInset={{ top: hidden }}
      scrollIndicatorInsets={{ top: hidden }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      contentContainerStyle={styles.thread}
      onContentSizeChange={() =>
        scroll.current?.scrollToEnd({ animated: true })
      }
    >
      {!messages.length && welcome ? (
        <View style={styles.bubble}>{welcome}</View>
      ) : null}
      {messages.map((message) => (
        <View
          key={message.id}
          style={[styles.bubble, message.role === "user" && styles.user]}
        >
          {!!message.text && (
            <Copy
              style={{
                fontSize: 14,
                color: message.role === "user" ? colors.surface : colors.ink,
              }}
            >
              {message.text}
            </Copy>
          )}
          {message.content}
        </View>
      ))}
      {!!suggestions.length && (
        <View style={styles.suggestions}>
          {suggestions.map((label) => (
            <Chip key={label} label={label} onPress={() => onSend(label)} />
          ))}
        </View>
      )}
    </ScrollView>
  );
});
const styles = StyleSheet.create({
  frame: { position: "absolute", left: 0, right: 0, bottom: 0 },
  thread: {
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    gap: space.sm,
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  bubble: {
    alignSelf: "flex-start",
    maxWidth: "94%",
    borderRadius: radius.lg,
    borderBottomLeftRadius: 5,
    backgroundColor: colors.surfaceAlt,
    padding: space.md,
    gap: space.sm,
  },
  user: {
    alignSelf: "flex-end",
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: 5,
    backgroundColor: colors.accent,
  },
  suggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: space.sm,
  },
});
