import { memo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Button, Copy, Mory, colors } from "@morydeals/ui";
import type { MobileProduct } from "../products-api";
import { ProductMasonry } from "./ProductMasonry";

/** Edit mode: cards select instead of opening, for bulk actions on the selection. */
export type CartEditing = {
  selected: ReadonlySet<string>;
  onToggle: (url: string) => void;
  onSelectAll: () => void;
  onDone: () => void;
};

/** Memoized: a tab switch elsewhere must not re-render every product card. */
export const CartPage = memo(function CartPage({
  products,
  ready,
  width,
  columns,
  onBrowse,
  onOpen,
  onEdit,
  editing,
  refreshError,
  onRetry,
}: {
  products: MobileProduct[];
  ready: boolean;
  width: number;
  columns: number;
  onBrowse: () => void;
  onOpen: (product: MobileProduct) => void;
  /** Shows the Edit control (the Cart page; not the sheet over a store). */
  onEdit?: () => void;
  editing?: CartEditing | null;
  /** Why the server cart could not be loaded; the cart saved on this phone is shown meanwhile. */
  refreshError?: string;
  onRetry?: () => void;
}) {
  const notice = refreshError ? (
    <View style={s.notice} accessibilityRole="alert">
      <Copy style={s.noticeText}>
        {products.length
          ? `${refreshError} Showing the cart saved on this phone.`
          : refreshError}
      </Copy>
      {onRetry ? <TextButton label="Retry" strong onPress={onRetry} /> : null}
    </View>
  ) : null;
  if (!ready) return <ActivityIndicator color={colors.accent} />;
  if (!products.length)
    return (
      <View style={s.empty}>
        {notice}
        <Mory pose="deals" size={130} />
        <Copy weight="extra">Your next find starts here.</Copy>
        <Button onPress={onBrowse}>Browse stores</Button>
      </View>
    );
  const allSelected =
    !!editing && products.every((p) => editing.selected.has(p.url));
  return (
    <View style={s.root}>
      {notice}
      {onEdit ? (
        <View style={s.bar}>
          <Copy weight="extra" style={s.count}>
            {editing
              ? `${editing.selected.size} selected`
              : products.length === 1
                ? "1 product"
                : `${products.length} products`}
          </Copy>
          {editing ? (
            <TextButton
              label={allSelected ? "Deselect all" : "Select all"}
              onPress={editing.onSelectAll}
            />
          ) : null}
          <TextButton
            label={editing ? "Done" : "Edit"}
            strong
            onPress={editing ? editing.onDone : onEdit}
          />
        </View>
      ) : null}
      <ProductMasonry
        products={products}
        width={width}
        columns={columns}
        selectedOf={
          editing ? (product) => editing.selected.has(product.url) : undefined
        }
        onPress={(product) =>
          editing ? editing.onToggle(product.url) : onOpen(product)
        }
      />
    </View>
  );
});
function TextButton({
  label,
  strong = false,
  onPress,
}: {
  label: string;
  strong?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={10}
      style={s.textButton}
    >
      <Copy
        weight={strong ? "extra" : "bold"}
        style={[s.textLabel, strong && { color: colors.accentInk }]}
      >
        {label}
      </Copy>
    </Pressable>
  );
}
const s = StyleSheet.create({
  root: { gap: 12 },
  bar: { flexDirection: "row", alignItems: "center", gap: 16, paddingTop: 12 },
  count: { flex: 1, fontSize: 17, lineHeight: 23 },
  textButton: { paddingVertical: 4 },
  textLabel: { fontSize: 15, lineHeight: 21 },
  empty: { alignItems: "center", gap: 18, paddingVertical: 35 },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.surfaceSunken,
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.ink },
});
