import { memo, useState } from "react";
import { userMessage } from "../errors";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Link } from "lucide-react-native";
import { Button, Copy, Pressable, colors, radius } from "@morydeals/ui";
import type { MerchantCatalog } from "./merchants-api";
import { productUrl } from "../products-api";
import { matchStores, storeLabel } from "../browse/home-state";
export type BrowserTarget = {
  name: string;
  url: string;
  logoUrl?: string | null;
};
const COLUMNS = 3;
const GAP = 10;
/** The store grid on Browse: three tiles a row, filtered by the store search; the last tile opens any other store. */
export const MerchantPicker = memo(function MerchantPicker({
  catalog,
  error,
  onReload,
  onOpen,
  query = "",
  width,
}: {
  catalog: MerchantCatalog | null;
  error: string;
  onReload: () => void;
  onOpen: (target: BrowserTarget) => void;
  /** The store search; matches names and domains. */
  query?: string;
  /** The grid's width, for three equal tiles a row. */
  width: number;
}) {
  const [others, setOthers] = useState(false);
  const [url, setUrl] = useState("");
  const [inputError, setInputError] = useState("");
  const openOther = () => {
    try {
      const value = productUrl(
        url,
        "Enter a complete store link starting with https://",
      );
      setInputError("");
      onOpen({ name: "Other store", url: value });
    } catch (e) {
      setInputError(
        userMessage(e, "Enter a complete store link starting with https://"),
      );
    }
  };
  // Floored so rounding never pushes the third tile onto the next row.
  const tile = { width: Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS) };
  const stores = catalog ? matchStores(catalog.merchants, query) : [];
  return (
    <View style={s.root}>
      {!catalog && !error ? <ActivityIndicator color={colors.accent} /> : null}
      {error ? (
        <>
          <Copy accessibilityRole="alert">{error}</Copy>
          <Button onPress={onReload}>Reload stores</Button>
        </>
      ) : null}
      {catalog && query.trim() && !stores.length ? (
        <Copy tone="muted">No store matches “{query.trim()}”.</Copy>
      ) : null}
      <View style={s.stores}>
        {stores.map((m) => (
          <Pressable
            key={m.id}
            accessibilityRole="button"
            accessibilityLabel={m.name}
            onPress={() =>
              onOpen({ name: m.name, url: m.homeUrl, logoUrl: m.logoUrl })
            }
            style={[s.tile, tile]}
          >
            <View style={s.logo}>
              {m.logoUrl ? (
                <Image
                  accessibilityIgnoresInvertColors
                  source={{ uri: m.logoUrl }}
                  resizeMode="contain"
                  style={s.logoImage}
                />
              ) : (
                <Copy weight="extra" style={s.logoFallback}>
                  {storeLabel(m.name).slice(0, 2).toUpperCase()}
                </Copy>
              )}
            </View>
            <Copy weight="extra" numberOfLines={2} style={s.storeName}>
              {storeLabel(m.name)}
            </Copy>
          </Pressable>
        ))}
        {catalog?.allowOthers ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Other store"
            accessibilityState={{ expanded: others }}
            onPress={() => setOthers((x) => !x)}
            style={[s.tile, s.otherTile, tile]}
          >
            <View style={[s.logo, s.otherMark]}>
              <Link size={20} color={colors.ink} />
            </View>
            <Copy weight="extra" numberOfLines={1} style={s.storeName}>
              Other store
            </Copy>
          </Pressable>
        ) : null}
      </View>
      {others && catalog?.allowOthers ? (
        <View style={s.other}>
          <TextInput
            accessibilityLabel="Other store URL"
            placeholder="https://your-store.com"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onSubmitEditing={openOther}
            style={s.input}
          />
          {inputError ? (
            <Copy accessibilityRole="alert">{inputError}</Copy>
          ) : null}
          <Button onPress={openOther}>Open store</Button>
        </View>
      ) : null}
    </View>
  );
});
const s = StyleSheet.create({
  root: { width: "100%", gap: 12 },
  stores: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  tile: {
    minHeight: 104,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    padding: 10,
  },
  otherTile: { backgroundColor: colors.surfaceAlt },
  otherMark: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  // The logo sits directly on the tile, with no plate behind it.
  logo: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImage: { width: 44, height: 44 },
  logoFallback: { fontSize: 15, color: colors.accentInk },
  storeName: { fontSize: 14, lineHeight: 18, textAlign: "center" },
  other: { gap: 10 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 24,
    padding: 16,
    color: colors.ink,
    backgroundColor: "white",
  },
});
