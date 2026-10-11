import { View, Text, StyleSheet } from "react-native";
import { colors, font, radius } from "../theme";
import type { ProductTag } from "./product-card";

/** Keep card metadata on one line; the full tags remain in the card's spoken label. */
export function TagRow({ tags }: { tags: readonly ProductTag[] }) {
  if (!tags.length) return null;
  return (
    <View style={styles.row}>
      {tags.slice(0, 2).map((tag, i) => (
        <View
          key={`${tag.label}-${i}`}
          style={[
            styles.tag,
            tag.tone === "accent" && styles.accent,
            tag.tone === "success" && styles.success,
          ]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.label,
              {
                color:
                  tag.tone === "accent"
                    ? colors.accentInk
                    : tag.tone === "success"
                      ? colors.success
                      : colors.muted,
              },
            ]}
          >
            {tag.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 4,
    height: 22,
    overflow: "hidden",
    alignItems: "center",
  },
  tag: {
    flexShrink: 1,
    minWidth: 0,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: colors.surfaceSunken,
  },
  accent: { backgroundColor: colors.accentSoft },
  success: { backgroundColor: colors.successSoft },
  label: { fontFamily: font.semibold, fontSize: 10, lineHeight: 15 },
});
