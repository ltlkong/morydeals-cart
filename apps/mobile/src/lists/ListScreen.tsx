import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ellipsis } from "lucide-react-native";
import { userMessage } from "../errors";
import { Copy, Mory, colors } from "@morydeals/ui";
import type { MobileProduct } from "../products-api";
import { ProductMasonry } from "../cart/ProductMasonry";
import { HeaderButton, StackScreen } from "../navigation/StackScreen";
import { deleteList, getList, renameList, type ListDetail } from "./lists-api";
import { ListNameSheet } from "./ListNameSheet";

/**
 * A list's products as cards, newest first; a card opens the product's page (where it can be taken out of the
 * list). The header menu renames or deletes the list.
 */
export function ListScreen({
  id,
  name,
  updatedAt,
  onClose,
  onOpen,
  onChanged,
}: {
  id: string;
  /** Shown until the list has loaded. */
  name: string;
  /** The overview's change time: products added or removed elsewhere (a product's page) reload the list. */
  updatedAt: string;
  onClose: () => void;
  onOpen: (product: MobileProduct) => void;
  /** The overview reloads after a change here. */
  onChanged: () => Promise<void>;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const available = Math.min(width - 32, 700);
  const [list, setList] = useState<ListDetail | null>(null);
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState(false);
  const load = useCallback(
    (signal?: AbortSignal) =>
      getList(id, signal)
        .then((detail) => {
          setList(detail);
          setError("");
        })
        .catch((failure: unknown) => {
          if (!signal?.aborted)
            setError(
              userMessage(failure, "Something went wrong. Please try again."),
            );
        }),
    [id],
  );
  useEffect(() => {
    const abort = new AbortController();
    void load(abort.signal);
    return () => abort.abort();
  }, [load, updatedAt]);
  const menu = () =>
    Alert.alert(list?.name ?? name, undefined, [
      { text: "Rename", onPress: () => setRenaming(true) },
      {
        text: "Delete list",
        style: "destructive",
        onPress: () =>
          Alert.alert(
            `Delete “${list?.name ?? name}”?`,
            "The list goes away; the products stay in your cart and history.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () =>
                  void deleteList(id)
                    .then(onChanged)
                    .then(onClose)
                    .catch((failure: unknown) =>
                      setError(
                        userMessage(
                          failure,
                          "Something went wrong. Please try again.",
                        ),
                      ),
                    ),
              },
            ],
          ),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  return (
    <StackScreen
      title={list?.name ?? name}
      onClose={onClose}
      zIndex={80}
      action={
        <HeaderButton label="List options" onPress={menu}>
          <Ellipsis size={20} color={colors.ink} />
        </HeaderButton>
      }
    >
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingBottom: 24 + insets.bottom },
        ]}
      >
        {error ? (
          <Copy accessibilityRole="alert" style={s.error}>
            {error}
          </Copy>
        ) : null}
        {!list ? (
          error ? null : (
            <ActivityIndicator color={colors.accent} />
          )
        ) : list.products.length ? (
          <ProductMasonry
            products={list.products}
            width={available}
            columns={width > 650 ? 3 : 2}
            onPress={onOpen}
          />
        ) : (
          <View style={s.empty}>
            <Mory pose="empty" size={120} />
            <Copy weight="extra">Nothing here yet</Copy>
            <Copy tone="muted" style={s.note}>
              Save products to this list from any product page.
            </Copy>
          </View>
        )}
      </ScrollView>
      <ListNameSheet
        visible={renaming}
        title="Rename list"
        confirm="Save"
        initial={list?.name ?? name}
        onClose={() => setRenaming(false)}
        onSubmit={async (next) => {
          await renameList(id, next);
          setList((current) =>
            current ? { ...current, name: next } : current,
          );
          await onChanged();
        }}
      />
    </StackScreen>
  );
}
const s = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
    alignItems: "center",
  },
  empty: { alignItems: "center", gap: 12, paddingVertical: 40 },
  note: { textAlign: "center", maxWidth: 300 },
  error: { fontSize: 13, lineHeight: 18, color: colors.danger },
});
