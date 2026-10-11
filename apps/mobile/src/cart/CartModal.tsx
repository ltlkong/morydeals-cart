import { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { X } from "lucide-react-native";
import { Copy, IconButton, colors } from "@morydeals/ui";
import type { MobileProduct } from "../products-api";
import { ProductDetail } from "../product/ProductDetail";
import { CartPage } from "./CartPage";

/**
 * The cart over a store page, as a sheet (swipe down to close), so checking the cart never leaves the store.
 * A product opens its page inside the sheet.
 */
export function CartModal({
  visible,
  products,
  ready,
  storeName,
  onClose,
  onShop,
  onSave,
  onAddToCart,
  onRemove,
}: {
  visible: boolean;
  products: MobileProduct[];
  ready: boolean;
  /** The store's display name for a product URL. */
  storeName: (url: string) => string;
  onClose: () => void;
  /** Opens the product in its store: the sheet closes first. */
  onShop: (url: string) => void;
  onSave: (url: string) => void;
  onAddToCart: (url: string) => Promise<void>;
  onRemove: (url: string) => Promise<void>;
}) {
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState<MobileProduct | null>(null);
  const available = Math.min(width - 32, 700);
  // Show the freshest copy after an add or a removal.
  const shown = open
    ? (products.find((p) => p.url === open.url) ?? open)
    : null;
  const close = () => {
    setOpen(null);
    onClose();
  };
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      {/* A modal is its own native root: gestures inside need their own handler root. */}
      <GestureHandlerRootView style={s.root}>
        <View style={s.header}>
          <Copy weight="extra" style={s.title}>
            Your cart
          </Copy>
          <IconButton label="Close cart" onPress={close}>
            <X size={20} color={colors.ink} />
          </IconButton>
        </View>
        <ScrollView contentContainerStyle={s.content}>
          <CartPage
            products={products}
            ready={ready}
            width={available}
            columns={width > 650 ? 3 : 2}
            onBrowse={close}
            onOpen={setOpen}
          />
        </ScrollView>
        {shown ? (
          <ProductDetail
            key={shown.url}
            product={shown}
            store={storeName(shown.url)}
            inCart={products.some((p) => p.url === shown.url)}
            onClose={() => setOpen(null)}
            onShop={() => {
              setOpen(null);
              onShop(shown.url);
            }}
            onSave={() => onSave(shown.url)}
            onAddToCart={() => onAddToCart(shown.url)}
            onRemove={() => onRemove(shown.url)}
            inSheet
          />
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 22, lineHeight: 30 },
  content: { paddingHorizontal: 16, paddingBottom: 40, alignItems: "center" },
});
