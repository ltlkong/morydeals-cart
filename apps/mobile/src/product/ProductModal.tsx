import { Modal, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { colors } from "@morydeals/ui";
import type { MobileProduct } from "../products-api";
import { ProductDetail } from "./ProductDetail";

/**
 * A product's page as a sheet over the store (from the store's product strip): swipe down or ✕ closes it and the
 * store page is where it was.
 */
export function ProductModal({
  product,
  store,
  inCart,
  onClose,
  onSave,
  onAddToCart,
  onRemove,
}: {
  /** The sheet shows while set. */
  product: MobileProduct | null;
  store: string;
  inCart: boolean;
  onClose: () => void;
  onSave: (url: string) => void;
  onAddToCart: (url: string) => Promise<void>;
  onRemove: (url: string) => Promise<void>;
}) {
  return (
    <Modal
      visible={!!product}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* A modal is its own native root: gestures inside need their own handler root. */}
      <GestureHandlerRootView style={s.root}>
        {product ? (
          <ProductDetail
            product={product}
            store={store}
            inCart={inCart}
            onClose={onClose}
            // The store page behind the sheet is this product's page.
            onShop={onClose}
            onSave={() => onSave(product.url)}
            onAddToCart={() => onAddToCart(product.url)}
            onRemove={() => onRemove(product.url)}
            sheetRoot
          />
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
