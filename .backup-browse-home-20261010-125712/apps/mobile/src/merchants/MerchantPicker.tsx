import { memo, useState } from "react";
import { userMessage } from "../errors";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Button, Copy, Pressable, colors } from "@morydeals/ui";
import type { MerchantCatalog } from "./merchants-api";
import { productUrl } from "../products-api";
export type BrowserTarget = {
  name: string;
  url: string;
  logoUrl?: string | null;
};
/** Store tiles for the browse page. Search and intent are handled by the AI dock. */
export const MerchantPicker = memo(function MerchantPicker({
  catalog,
  error,
  onReload,
  onOpen,
}: {
  catalog: MerchantCatalog | null;
  error: string;
  onReload: () => void;
  onOpen: (target: BrowserTarget) => void;
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
  return (
    <View style={s.root}>
      {!catalog && !error ? <ActivityIndicator color={colors.accent} /> : null}
      {error ? (
        <>
          <Copy accessibilityRole="alert">{error}</Copy>
          <Button onPress={onReload}>Reload stores</Button>
        </>
      ) : null}
      <View style={s.stores}>
        {catalog?.merchants.map((m) => (
          <Pressable
            key={m.id}
            accessibilityRole="button"
            accessibilityLabel={m.name}
            onPress={() =>
              onOpen({ name: m.name, url: m.homeUrl, logoUrl: m.logoUrl })
            }
            style={s.tile}
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
                  {m.name
                    .replace(/ Canada$/, "")
                    .slice(0, 2)
                    .toUpperCase()}
                </Copy>
              )}
            </View>
            <Copy weight="extra" style={s.storeName}>
              {m.name.replace(/ Canada$/, "")}
            </Copy>
          </Pressable>
        ))}
        {catalog?.allowOthers ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Other stores"
            accessibilityState={{ expanded: others }}
            onPress={() => setOthers((x) => !x)}
            style={s.tile}
          >
            <Copy weight="extra" style={s.storeName}>
              Others +
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
  stores: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    width: "48%",
    minHeight: 110,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    padding: 10,
  },
  // The logo sits directly on the tile, with no plate behind it.
  logo: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImage: { width: 48, height: 48 },
  logoFallback: { fontSize: 15, color: colors.accentInk },
  storeName: { fontSize: 20, textAlign: "center" },
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
