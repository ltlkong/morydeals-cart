import type { ReactNode } from "react";
import { StyleSheet, View, type ImageSourcePropType } from "react-native";
import { Check } from "lucide-react-native";
import Animated from "react-native-reanimated";
import { Pressable, usePressScale } from "../primitives/Pressable";
import { Badge } from "../feedback/Badge";
import { colors, radius, space } from "../theme";
import { ProductImage } from "./ProductImage";
import { ProductCardContent } from "./ProductCardContent";
import type { ProductCardData, ProductCardVariant } from "./product-card";

export type ProductCardProps = {
  card: ProductCardData;
  variant?: ProductCardVariant;
  width?: number;
  imageHeight?: number;
  imageSize?: number;
  source?: ImageSourcePropType;
  renderImage?: (geometry: { width: number; height: number }) => ReactNode;
  /** A sibling of the detail action, so copying a coupon never opens details. */
  action?: ReactNode;
  /** Selection mode (editing a collection): the card shows a check mark, and a press selects it. */
  selected?: boolean;
  onPress: () => void;
};
export function ProductCard({
  card,
  variant = "vertical",
  width,
  imageHeight,
  imageSize = 88,
  source,
  renderImage,
  action,
  selected,
  onPress,
}: ProductCardProps) {
  const selecting = selected !== undefined;
  // The whole card zooms on a press, not only its touch target: the action row is a sibling of the target (so
  // its buttons stay their own controls, also for screen readers) but sits inside the frame that scales.
  const zoom = usePressScale(0.985);
  const horizontal = variant === "horizontal";
  const compact = variant === "vertical-small";
  // Vertical cards use a full-bleed media block. The content below still owns its padding, while the
  // product image reaches the card's left and right edges like the original shopping card.
  const mediaWidth = horizontal ? imageSize : (width ?? (compact ? 164 : 220));
  const mediaHeight = horizontal
    ? imageSize
    : (imageHeight ?? (compact ? 112 : 180));
  const image = renderImage?.({ width: mediaWidth, height: mediaHeight }) ?? (
    <ProductImage
      source={source ?? (card.imageUrl ? { uri: card.imageUrl } : undefined)}
      width={mediaWidth}
      height={mediaHeight}
    />
  );
  const label = [
    card.title,
    card.price ?? card.noPriceLabel ?? "Awaiting price",
    card.was ? `Previously ${card.was}` : null,
    ...card.productTags.map((t) => t.label),
    card.badge,
    card.where,
    card.trend?.label,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <Animated.View style={[styles.frame, { width }, zoom.style]}>
      <Pressable
        accessibilityRole={selecting ? "checkbox" : "button"}
        accessibilityLabel={selecting ? label : `View ${label}`}
        accessibilityState={selecting ? { checked: selected } : undefined}
        pressedScale={1}
        onPressIn={zoom.pressIn}
        onPressOut={zoom.pressOut}
        onPress={onPress}
        style={({ hovered, focused }) => [
          horizontal ? styles.horizontal : styles.vertical,
          (hovered || focused) && { backgroundColor: colors.surfaceAlt },
        ]}
      >
        <View
          style={[
            styles.media,
            { width: mediaWidth, height: mediaHeight },
            !horizontal && styles.verticalMedia,
          ]}
        >
          {image}
          {!!card.badge && (
            <View style={styles.badge}>
              <Badge>{card.badge}</Badge>
            </View>
          )}
          {selecting ? (
            <View style={[styles.mark, selected && styles.marked]}>
              {selected ? (
                <Check size={14} color={colors.onAccent} strokeWidth={3} />
              ) : null}
            </View>
          ) : null}
        </View>
        <ProductCardContent
          card={card}
          compact={compact}
          horizontal={horizontal}
        />
      </Pressable>
      {action ? <View style={styles.action}>{action}</View> : null}
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  vertical: { gap: 2 },
  horizontal: { flexDirection: "row", gap: space.md, padding: space.md },
  media: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  verticalMedia: { borderRadius: 0 },
  badge: { position: "absolute", top: 6, left: 6 },
  mark: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: "rgba(34, 30, 27, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  marked: { backgroundColor: colors.accent, borderColor: colors.accent },
  action: { paddingHorizontal: space.sm, paddingBottom: space.sm },
});
