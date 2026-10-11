import { StyleSheet, Text } from "react-native";

import { colors } from "../theme/tokens";
import { font } from "../theme/typography";

/** The product name in two colours: "Mory" in ink, the product ("Cart") in the accent. */
export function Wordmark({
  size = 20,
  product = "Cart",
}: {
  size?: number;
  product?: string;
}) {
  return (
    <Text
      accessibilityRole="header"
      style={[styles.word, { fontSize: size, lineHeight: size * 1.2 }]}
      numberOfLines={1}
    >
      Mory<Text style={styles.product}>{product}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  word: { fontFamily: font.extra, color: colors.ink, letterSpacing: -0.3 },
  product: { color: colors.accent },
});
