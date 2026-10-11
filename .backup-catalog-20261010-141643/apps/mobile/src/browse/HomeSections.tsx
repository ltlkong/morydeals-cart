import { useState, type ComponentType, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { ChevronRight, X } from "lucide-react-native";
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
import type { MobileProduct } from "../products-api";
import { Product } from "../cart/Product";
import { storeTiles } from "./home-state";

/** Everything a Browse section may read; each section picks what it needs. */
export type HomeContext = {
  width: number;
  catalog: MerchantCatalog | null;
  catalogError: string;
  reloadCatalog: () => void;
  openStore: (target: BrowserTarget) => void;
  /** Open store tabs, the most recent first (see openTabs); their stores lead the grid, marked Continue. */
  tabs: readonly BrowserTarget[];
  /** The shopper's recent history, without the products in the cart (see recentlyViewed). */
  recentlyViewed: readonly MobileProduct[];
  openProduct: (product: MobileProduct) => void;
  openHistory: () => void;
  /** No product yet and the intro not dismissed. */
  firstRun: boolean;
  dismissIntro: () => void;
};

export type HomeSection = {
  key: string;
  /** Not built yet: the backend it waits for. A planned section is never shown. */
  planned?: string;
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

/** The main content: every store (open ones first, to continue), a search over them, and any other store by link. */
function StoresSection({
  catalog,
  catalogError,
  reloadCatalog,
  openStore,
  tabs,
  firstRun,
  width,
}: HomeContext) {
  const [query, setQuery] = useState("");
  // Returning shoppers see two rows until they ask for the rest; the first run shows every store.
  const [expanded, setExpanded] = useState(false);
  const { tiles, hidden } = storeTiles({
    merchants: catalog?.merchants ?? [],
    tabs,
    query,
    collapsed: !firstRun && !expanded,
    allowOthers: !!catalog?.allowOthers,
  });
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
        tiles={tiles}
        query={query}
        hidden={hidden}
        onShowAll={() => setExpanded(true)}
        width={width}
      />
    </View>
  );
}

const SHELF_CARD = 140;

/** Products the shopper looked at in stores, newest first; a card opens the product's page. */
function RecentlyViewedSection({
  recentlyViewed,
  openProduct,
  openHistory,
}: HomeContext) {
  return (
    <View style={s.section}>
      <View style={s.headerRow}>
        <SectionHeader>Recently viewed</SectionHeader>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open browsing history"
          hitSlop={8}
          onPress={openHistory}
          style={s.link}
        >
          <Copy weight="extra" tone="accentInk" style={s.caption}>
            History
          </Copy>
          <ChevronRight size={15} color={colors.accentInk} />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.shelf}
        style={s.shelfScroll}
      >
        {recentlyViewed.map((product) => (
          <Product
            key={product.url}
            product={product}
            width={SHELF_CARD}
            onPress={() => openProduct(product)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

/** Waits for its backend; never rendered (`planned` sections are filtered out). */
const Planned = () => null;

/**
 * Browse, top to bottom: stores first, products under them. Adding a section is one entry here; a planned entry
 * becomes live by dropping `planned` and giving it a Section. Category chips and per-store coupon counts wait for
 * the API to carry them.
 */
export const HOME_SECTIONS: readonly HomeSection[] = [
  { key: "intro", visible: (c) => c.firstRun, Section: IntroSection },
  { key: "stores", visible: () => true, Section: StoresSection },
  {
    key: "recently-viewed",
    visible: (c) => c.recentlyViewed.length > 0,
    Section: RecentlyViewedSection,
  },
  {
    key: "price-drops",
    planned: "GET /catalog/drops (catalog-wide; ?merchant= for your stores)",
    visible: () => false,
    Section: Planned,
  },
  {
    key: "popular-at-store",
    planned: "GET /catalog/popular?merchant= (cart adds across shoppers)",
    visible: () => false,
    Section: Planned,
  },
  {
    key: "deals",
    planned: "Deal posts API",
    visible: () => false,
    Section: Planned,
  },
];

/** The sections Browse renders now, in order. */
export const liveSections = (context: HomeContext) =>
  HOME_SECTIONS.filter(
    (section) => !section.planned && section.visible(context),
  );

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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  link: { flexDirection: "row", alignItems: "center" },
  // The shelf runs to the screen edges, past the page's side padding.
  shelfScroll: { marginHorizontal: -16 },
  shelf: { gap: 10, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 18, lineHeight: 24 },
  caption: { fontSize: 13, lineHeight: 18 },
});
