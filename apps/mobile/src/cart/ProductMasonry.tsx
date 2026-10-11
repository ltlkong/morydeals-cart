import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { Masonry, colors, useMeasuredItems } from "@morydeals/ui";
import type { MobileProduct } from "../products-api";
import {
  Product,
  productCardHeight,
  productImageUrl,
  productKey,
} from "./Product";

/**
 * Product cards in a masonry, each image box shaped like its image. A card appears once its image is measured
 * (in order, so cards are only ever appended and never move); until then the footer shows a spinner.
 */
export function ProductMasonry({
  products,
  width,
  columns,
  onPress,
  selectedOf,
  footer = (measuring) =>
    measuring ? (
      <View style={{ paddingVertical: 12 }}>
        <ActivityIndicator
          color={colors.accent}
          accessibilityLabel="Loading products"
        />
      </View>
    ) : null,
}: {
  products: readonly MobileProduct[];
  width: number;
  columns: number;
  onPress: (product: MobileProduct) => void;
  /** Editing: whether a card is selected (undefined when not editing). */
  selectedOf?: (product: MobileProduct) => boolean | undefined;
  /** Below the cards; `measuring` is true while later cards wait for their images. */
  footer?: (measuring: boolean) => ReactNode;
}) {
  const { ready, ratioOf, measuring } = useMeasuredItems(
    products,
    productKey,
    productImageUrl,
  );
  return (
    <>
      <Masonry
        items={ready}
        width={width}
        columns={columns}
        gap={10}
        keyExtractor={productKey}
        getItemHeight={(product, w) => productCardHeight(w, ratioOf(product))}
        renderItem={(product, w) => (
          <Product
            product={product}
            width={w}
            ratio={ratioOf(product)}
            selected={selectedOf?.(product)}
            onPress={() => onPress(product)}
          />
        )}
      />
      {footer(measuring)}
    </>
  );
}
