import { memo, useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { ArrowUp } from "lucide-react-native";
import {
  ReduceMotion,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Pressable } from "../primitives/Pressable";
import { colors, font, radius } from "../theme";

type Props = {
  onSend: (text: string) => boolean | void;
  onFocused: (value: boolean) => void;
  onHasDraft: (value: boolean) => void;
  keystrokes: SharedValue<number>;
  placeholder: string;
};
/** Draft ownership stays here: typing never re-renders the conversation. */
export const DockInput = memo(function DockInput({
  onSend,
  onFocused,
  onHasDraft,
  keystrokes,
  placeholder,
}: Props) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const count = useRef(0);
  const submit = () => {
    const text = draft.trim();
    if (!text || onSend(text) === false) return;
    setDraft("");
    onHasDraft(false);
  };
  return (
    <View style={[styles.row, focused && { borderColor: colors.accentInk }]}>
      <TextInput
        accessibilityLabel="Message Mory or paste a product link"
        style={styles.input}
        value={draft}
        onChangeText={(text) => {
          setDraft(text);
          onHasDraft(!!text);
          keystrokes.set(
            withTiming(++count.current, {
              duration: 300,
              reduceMotion: ReduceMotion.System,
            }),
          );
        }}
        onFocus={() => {
          setFocused(true);
          onFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
          onFocused(false);
        }}
        onSubmitEditing={submit}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="send"
        maxLength={2000}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send message"
        accessibilityState={{ disabled: !draft.trim() }}
        disabled={!draft.trim()}
        onPress={submit}
        style={[styles.send, !draft.trim() && { opacity: 0.5 }]}
      >
        <ArrowUp size={20} color={colors.onAccent} strokeWidth={3} />
      </Pressable>
    </View>
  );
});
const styles = StyleSheet.create({
  row: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: 4,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.fieldFace,
    borderWidth: 1,
    borderColor: colors.line,
  },
  input: {
    outlineWidth: 0,
    outlineStyle: "solid",
    outlineColor: "transparent",
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    height: 38,
    fontFamily: font.regular,
    fontSize: 14,
    color: colors.ink,
  },
  send: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
});
