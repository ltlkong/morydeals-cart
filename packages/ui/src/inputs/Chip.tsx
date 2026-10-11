import { View, StyleSheet } from "react-native";
import { Pressable } from "../primitives/Pressable";
import { Copy } from "../content/Copy";
import { colors } from "../theme/index";

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ hovered }) => [
        s.chip,
        hovered && { backgroundColor: colors.surfaceAlt },
        selected && {
          backgroundColor: colors.accentSoft,
          borderColor: colors.chipLine,
        },
      ]}
    >
      {selected && (
        <View
          style={{
            width: 5,
            height: 5,
            borderRadius: 3,
            backgroundColor: colors.accentInk,
          }}
        />
      )}
      <Copy
        weight="bold"
        style={{
          fontSize: 12,
          color: selected ? colors.accentInk : colors.muted,
        }}
      >
        {label}
      </Copy>
    </Pressable>
  );
}
const s = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    justifyContent: "center",
  },
});
