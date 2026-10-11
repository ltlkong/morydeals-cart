import { Image, StyleSheet, View } from "react-native";
import { ImageOff } from "lucide-react-native";
import { colors } from "../theme";
import type { ProductImageProps } from "./product-card";

/** Fixed geometry: images never change a masonry cell's height after loading. */
export function ProductImage({ source, width, height }: ProductImageProps) {
  return (
    <View style={[styles.frame, { width, height }]}>
      {source ? (
        <Image
          source={source}
          resizeMode="contain"
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <ImageOff size={24} color={colors.faint} />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: colors.surfaceAlt,
  },
});
