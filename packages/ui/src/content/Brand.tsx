import { StyleSheet, Text, View } from "react-native";

import { colors, fontSize } from "../theme/tokens";
import { BrandSparkles } from "./BrandSparkles";
import { Wordmark } from "./Wordmark";

/** The page header's brand: the wordmark with its sparkles, and a one-line tagline under it. */
export function Brand({ tagline }: { tagline?: string }) {
  return (
    <View style={styles.intro}>
      <View style={styles.wordmark}>
        <Wordmark size={24} />
        <View style={styles.rays}>
          <BrandSparkles size={28} />
        </View>
      </View>
      {tagline ? (
        <Text style={styles.tagline} numberOfLines={1}>
          {tagline}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 2 },
  wordmark: { flexDirection: "row", alignItems: "center", gap: 3 },
  rays: { transform: [{ translateY: -9 }] },
  tagline: {
    fontSize: fontSize.caption,
    color: colors.muted,
    fontWeight: "600",
  },
});
