import { useState, type ComponentType, type ReactNode } from "react";
import { Image, StyleSheet, View } from "react-native";
import { X } from "lucide-react-native";
import {
  Copy,
  MoryAvatar,
  Pressable,
  SearchField,
  colors,
  radius,
} from "@morydeals/ui";
import type { MerchantCatalog } from "../merchants/merchants-api";
import {
  MerchantPicker,
  type BrowserTarget,
} from "../merchants/MerchantPicker";
import { storeLabel } from "./home-state";

/** Everything a Browse section may read; each section picks what it needs. */
export type HomeContext = {
  width: number;
  catalog: MerchantCatalog | null;
  catalogError: string;
  reloadCatalog: () => void;
  openStore: (target: BrowserTarget) => void;
  /** Open store tabs to offer again, the most recent first (see continueTargets). */
  resumable: readonly BrowserTarget[];
  /** No product yet and the intro not dismissed. */
  firstRun: boolean;
  dismissIntro: () => void;
};

export type HomeSection = {
  key: string;
  /** Hidden sections render nothing, not even their gap. */
  visible: (context: HomeContext) => boolean;
  Section: ComponentType<HomeContext>;
};

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <Copy weight="extra" accessibilityRole="header" style={s.sectionTitle}>
      {children}
    </Copy>
  );
}

/** First run: a page heading and a one-line how-to the shopper can dismiss. */
function IntroSection({ dismissIntro }: HomeContext) {
  return (
    <View style={s.welcome}>
      <View style={s.intro}>
        <Copy weight="extra" accessibilityRole="header" style={s.title}>
          Pick a store to start.
        </Copy>
        <Copy tone="muted">Shop as usual. Mory watches prices for you.</Copy>
      </View>
      <View style={s.strip}>
        <MoryAvatar size="sm" />
        <Copy style={s.stripText}>
          New here? Open a store, tap Mory and choose{" "}
          <Copy weight="extra" style={s.stripText}>
            Capture this product
          </Copy>
          . Mory tells you when the price drops.
        </Copy>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss the intro"
          hitSlop={8}
          onPress={dismissIntro}
          style={s.stripClose}
        >
          <X size={16} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

function StoreMark({ target }: { target: BrowserTarget }) {
  return (
    <View style={s.mark}>
      {target.logoUrl ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri: target.logoUrl }}
          resizeMode="contain"
          style={s.markImage}
        />
      ) : (
        <Copy weight="extra" style={s.markText}>
          {storeLabel(target.name).slice(0, 2).toUpperCase()}
        </Copy>
      )}
    </View>
  );
}

/** The store tabs still open behind Browse, so a round trip lands back on the same page. */
function ContinueSection({ resumable, openStore }: HomeContext) {
  return (
    <View style={s.section}>
      <SectionHeader>Continue shopping</SectionHeader>
      {resumable.map((target) => (
        <Pressable
          key={target.url}
          accessibilityRole="button"
          accessibilityLabel={`Resume ${storeLabel(target.name)}`}
          onPress={() => openStore(target)}
          style={s.resume}
        >
          <StoreMark target={target} />
          <View style={{ flex: 1 }}>
            <Copy weight="extra" numberOfLines={1}>
              Continue at {storeLabel(target.name)}
            </Copy>
            <Copy tone="muted" style={s.caption}>
              Open tab
            </Copy>
          </View>
          <Copy weight="extra" tone="accentInk" style={s.caption}>
            Resume
          </Copy>
        </Pressable>
      ))}
    </View>
  );
}

/** The main content: every store, a search over them, and any other store by link. */
function StoresSection({
  catalog,
  catalogError,
  reloadCatalog,
  openStore,
  width,
}: HomeContext) {
  const [query, setQuery] = useState("");
  return (
    <View style={s.section}>
      <SectionHeader>All stores</SectionHeader>
      {catalog ? (
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Find a store"
          clearLabel="Clear store search"
        />
      ) : null}
      <MerchantPicker
        catalog={catalog}
        error={catalogError}
        onReload={reloadCatalog}
        onOpen={openStore}
        query={query}
        width={width}
      />
    </View>
  );
}

/**
 * Browse, top to bottom. Adding a section (e.g. Deals) is one entry here; category chips and per-store coupon
 * counts wait for the merchants API to carry them.
 */
export const HOME_SECTIONS: readonly HomeSection[] = [
  { key: "intro", visible: (c) => c.firstRun, Section: IntroSection },
  {
    key: "continue",
    visible: (c) => c.resumable.length > 0,
    Section: ContinueSection,
  },
  { key: "stores", visible: () => true, Section: StoresSection },
];

const s = StyleSheet.create({
  welcome: { gap: 14 },
  intro: { gap: 2, paddingTop: 4 },
  title: { fontSize: 24, lineHeight: 30 },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 8,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.chipLine,
  },
  stripText: { flex: 1, fontSize: 13, lineHeight: 18 },
  stripClose: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  section: { gap: 10 },
  sectionTitle: { fontSize: 18, lineHeight: 24 },
  resume: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  caption: { fontSize: 13, lineHeight: 18 },
  mark: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSunken,
    overflow: "hidden",
  },
  markImage: { width: 28, height: 28 },
  markText: { fontSize: 12, color: colors.accentInk },
});
