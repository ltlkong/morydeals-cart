import { Image, StyleSheet, View } from "react-native";
import { ListChecks } from "lucide-react-native";
import { colors, radius } from "../theme/index";
import { coverTiles } from "./list-cover";

/** A list's square cover: its newest product images as a mosaic (one image fills it; none shows an icon). */
export function ListCover({
  images,
  size,
}: {
  images: readonly string[];
  size: number;
}) {
  const tiles = coverTiles(images);
  const frame = [styles.frame, { width: size, height: size }];
  if (tiles.kind === "empty")
    return (
      <View style={[frame, styles.center]}>
        <ListChecks size={size * 0.36} color={colors.faint} />
      </View>
    );
  if (tiles.kind === "single")
    return (
      <View style={frame}>
        <Image
          source={{ uri: tiles.image }}
          resizeMode="contain"
          style={styles.fill}
        />
      </View>
    );
  const cell = (size - 3) / 2;
  return (
    <View style={[frame, styles.grid]}>
      {tiles.cells.map((image, index) => (
        <View
          key={index}
          style={[styles.cell, { width: cell, height: cell }]}
        >
          {image ? (
            <Image
              source={{ uri: image }}
              resizeMode="contain"
              style={styles.fill}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surfaceAlt,
  },
  center: { alignItems: "center", justifyContent: "center" },
  fill: { width: "100%", height: "100%" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 1, padding: 0.5 },
  cell: { backgroundColor: colors.surface },
});
