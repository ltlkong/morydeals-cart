import Search from "lucide-react-native/icons/search";
import X from "lucide-react-native/icons/x";
import { useState, type Ref } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { Pressable } from "../primitives/Pressable";
import { colors, radius, space } from "../theme/tokens";
import { font } from "../theme/typography";
import { NO_OUTLINE } from "./no-outline";
import { RotatingPlaceholder } from "./RotatingPlaceholder";

type Props = {
  inputRef?: Ref<TextInput>;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  /** Words that roll through the empty field in place of the static placeholder (which still names it for assistive tech). */
  hints?: readonly string[];
  /** Names the field for assistive tech (defaults to the placeholder). */
  label?: string;
  /** Clears the text; shown while there is some. */
  clearLabel: string;
  /** Enter (the keyboard's search key): run the search. */
  onSubmit?: () => void;
  /**
   * The site's main search: a taller pill with a firmer border; with `onSubmit` and `submitLabel`, a search
   * button at the end (Enter searches either way).
   */
  prominent?: boolean;
  submitLabel?: string;
  /** Told when the field gains and loses focus (e.g. to show recent searches under it). */
  onFocus?: () => void;
  onBlur?: () => void;
};

/** A rounded (pill) search box: a search mark, the text, a clear button while typing; focus shows the accent border. */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  hints,
  label,
  clearLabel,
  onSubmit,
  prominent = false,
  submitLabel,
  onFocus,
  onBlur,
  inputRef,
}: Props) {
  const [focused, setFocused] = useState(false);
  const rolling = Boolean(hints?.length) && !value;
  return (
    <View
      style={[
        styles.box,
        prominent && styles.prominent,
        focused && styles.focused,
      ]}
    >
      <Search size={18} color={focused ? colors.accentInk : colors.muted} />
      <View style={styles.field}>
        <TextInput
          ref={inputRef}
          accessibilityLabel={label ?? placeholder}
          value={value}
          onChangeText={onChangeText}
          placeholder={rolling ? "" : placeholder}
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={onSubmit}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          style={[styles.input, NO_OUTLINE]}
        />
        {rolling && hints ? (
          <View pointerEvents="none" style={styles.hints}>
            <RotatingPlaceholder hints={hints} paused={focused} />
          </View>
        ) : null}
      </View>
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          hitSlop={8}
          onPress={() => onChangeText("")}
          style={styles.clear}
        >
          <X size={16} color={colors.muted} />
        </Pressable>
      ) : null}
      {prominent && onSubmit && submitLabel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
          onPress={onSubmit}
          style={styles.submit}
        >
          <Search size={18} color={colors.onAccent} strokeWidth={2.5} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1, height: "100%", justifyContent: "center" },
  hints: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: "center",
  },
  box: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    // Every search box shares the pill shape; hosts never restyle it.
    borderRadius: radius.pill,
    borderWidth: 1,
    // lineStrong: the box has to read as a field on white and on the page background alike.
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  prominent: { height: 44, paddingRight: 4, borderWidth: 1.5 },
  submit: {
    width: 52,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  focused: { borderColor: colors.accent, borderWidth: 1.5 },
  input: {
    flex: 1,
    height: "100%",
    fontFamily: font.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  clear: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.surfaceSunken,
  },
});
