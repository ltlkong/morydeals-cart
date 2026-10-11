import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Copy, Masonry, Mory } from "@morydeals/ui";
import type { MobileProduct } from "../products-api";
import { Product, productCardHeight } from "../cart/Product";
import { StackScreen } from "../navigation/StackScreen";

/** Products found while browsing stores, newest first, as cards like the cart's; a card opens the product's page. */
export function HistoryScreen({
  products,
  onClose,
  onOpen,
}: {
  products: MobileProduct[];
  onClose: () => void;
  onOpen: (product: MobileProduct) => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const available = Math.min(width - 32, 700);
  return (
    <StackScreen title="Browsing history" onClose={onClose} zIndex={80}>
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingBottom: 24 + insets.bottom },
        ]}
      >
        {products.length ? (
          <Masonry
            items={products}
            width={available}
            columns={width > 650 ? 3 : 2}
            gap={10}
            keyExtractor={(p) => p.url}
            getItemHeight={(_, w) => productCardHeight(w)}
            renderItem={(product, w) => (
              <Product
                product={product}
                width={w}
                onPress={() => onOpen(product)}
              />
            )}
          />
        ) : (
          <View style={s.empty}>
            <Mory pose="scan" size={120} />
            <Copy weight="extra">No history yet</Copy>
            <Copy tone="muted" style={s.note}>
              Products you look at in stores show up here, so you can find them
              again.
            </Copy>
          </View>
        )}
      </ScrollView>
    </StackScreen>
  );
}
const s = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8, alignItems: "center" },
  empty: { alignItems: "center", gap: 12, paddingVertical: 40 },
  note: { textAlign: "center", maxWidth: 300 },
});
