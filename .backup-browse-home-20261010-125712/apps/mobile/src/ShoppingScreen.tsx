import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  Compass,
  ShoppingBag,
  ListChecks,
  UserRound,
} from "lucide-react-native";
import {
  Brand,
  Button,
  Copy,
  DockNavigation,
  dockNavigationWidth,
  FloatingTabBar,
  MoryLookProvider,
  useCompactOnScroll,
  floatingTabBarSpace,
  LogoCarousel,
  Mory,
  MoryField,
  PageFade,
  PullToRefresh,
  colors,
  radius,
  useMinimumRefresh,
  type DockNavigationItem,
} from "@morydeals/ui";
import { AccountScreen } from "./account/AccountScreen";
import { HistoryScreen } from "./account/HistoryScreen";
import { MoryScreen } from "./account/MoryScreen";
import { useStoredMoryLook } from "./account/mory-look";
import { CartPage } from "./cart/CartPage";
import { CartModal } from "./cart/CartModal";
import { CartEditBar } from "./cart/CartEditBar";
import { selectAll, toggleSelected } from "./cart/cart-selection";
import { MerchantPicker, type BrowserTarget } from "./merchants/MerchantPicker";
import { MerchantBrowser } from "./merchants/MerchantBrowser";
import { useMerchants } from "./merchants/use-merchants";
import { addToCart, removeFromCart } from "./cart/cart-api";
import { ProductDetail } from "./product/ProductDetail";
import { ProductModal } from "./product/ProductModal";
import { storeFor } from "./product/product-store";
import { getHistory } from "./merchants/visits-api";
import type { MobileProduct } from "./products-api";
import { ListsScreen } from "./lists/ListsScreen";
import { ListScreen } from "./lists/ListScreen";
import { ListPicker } from "./lists/ListPicker";
import { useLists } from "./lists/use-lists";
import type { ListSummary } from "./lists/lists-api";
import { useProducts } from "./use-products";
/** While Browse is not the open page, its icon cycles through the stores' logos. */
const navigationItems = (logos: string[]): DockNavigationItem[] => [
  {
    key: "browse",
    label: "Browse stores",
    title: "Browse",
    icon: (selected) =>
      selected || !logos.length ? (
        <Compass size={20} color={selected ? colors.accent : colors.ink} />
      ) : (
        <LogoCarousel uris={logos} size={22} />
      ),
  },
  {
    key: "cart",
    label: "Your cart",
    title: "Cart",
    icon: (selected) => (
      <ShoppingBag size={20} color={selected ? colors.accent : colors.ink} />
    ),
  },
  {
    key: "lists",
    label: "Your lists",
    title: "List",
    icon: (selected) => (
      <ListChecks size={20} color={selected ? colors.accent : colors.ink} />
    ),
  },
  {
    key: "account",
    label: "Your account",
    title: "Account",
    icon: (selected) => (
      <UserRound size={20} color={selected ? colors.accent : colors.ink} />
    ),
  },
];
const tick = () => {
  void Haptics.selectionAsync().catch(() => undefined);
};
export function ShoppingScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  // Scrolling down shrinks the tab bar to icons; a tap on it brings the labels back.
  const tabBar = useCompactOnScroll();
  const [page, setPage] = useState("browse");
  const [browser, setBrowser] = useState<BrowserTarget | null>(null);
  // A route change temporarily hides the active browser. An explicit close clears this
  // resume target so returning to Browse does not unexpectedly reopen the store.
  const [browserResume, setBrowserResume] = useState<BrowserTarget | null>(
    null,
  );
  const [browserSessions, setBrowserSessions] = useState<BrowserTarget[]>([]);
  const openBrowser = useCallback((target: BrowserTarget) => {
    setBrowserSessions((sessions) =>
      sessions.some((item) => item.url === target.url)
        ? sessions
        : [...sessions, target],
    );
    setBrowser(target);
    setBrowserResume(target);
  }, []);
  const closeBrowser = useCallback(() => {
    setBrowser(null);
    setBrowserResume(null);
  }, []);
  // The products the list picker is saving (one from a product, several from a cart selection).
  const [saving, setSaving] = useState<readonly string[] | null>(null);
  const saveOne = useCallback((url: string) => setSaving([url]), []);
  const merchants = useMerchants();
  const storeLogos = useMemo(
    () =>
      merchants.catalog?.merchants.flatMap((m) =>
        m.logoUrl ? [m.logoUrl] : [],
      ) ?? [],
    [merchants.catalog],
  );
  const navigation = useMemo(() => navigationItems(storeLogos), [storeLogos]);
  const browseRefresh = useMinimumRefresh(merchants.reload);
  const {
    products,
    status,
    message,
    submit,
    lastUrl,
    lastProduct,
    retry,
    canRetry,
    messages,
    note,
    ready,
    storageError,
    cartError,
    reloadCart,
  } = useProducts();
  // Explicit adds (the browser strip, Recently viewed) go to the server cart, then the cart reloads.
  const addProductToCart = useCallback(
    async (url: string) => {
      await addToCart(url);
      await reloadCart();
    },
    [reloadCart],
  );
  // The open product page; shown with the freshest copy (the cart reloads after an add or a removal).
  const [detail, setDetail] = useState<MobileProduct | null>(null);
  // A product opened from a store's strip: shown as a sheet over the store.
  const [viewing, setViewing] = useState<MobileProduct | null>(null);
  const closeDetail = useCallback(() => setDetail(null), []);
  const shownDetail = detail
    ? (products.find((p) => p.url === detail.url) ?? detail)
    : null;
  const removeProductFromCart = useCallback(
    async (url: string) => {
      await removeFromCart(url);
      await reloadCart();
    },
    [reloadCart],
  );
  const [viewed, setViewed] = useState<MobileProduct[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const openHistory = useCallback(() => setHistoryOpen(true), []);
  // The shopper's Mory, for every Mory in the app.
  const mory = useStoredMoryLook();
  const [moryOpen, setMoryOpen] = useState(false);
  const openMory = useCallback(() => setMoryOpen(true), []);
  // Only a changed history re-renders the list.
  const reloadHistory = useCallback(
    (signal?: AbortSignal) =>
      getHistory(signal)
        .then((items) =>
          setViewed((previous) =>
            JSON.stringify(previous) === JSON.stringify(items)
              ? previous
              : items,
          ),
        )
        .catch(() => undefined),
    [],
  );
  useEffect(() => {
    if (page !== "account" && !historyOpen) return;
    const abort = new AbortController();
    void reloadHistory(abort.signal);
    return () => abort.abort();
  }, [page, historyOpen, reloadHistory]);
  // Pull-to-refresh reloads what the page shows: the store catalog, the server cart, or the history.
  const cartRefresh = useMinimumRefresh(reloadCart);
  const historyRefresh = useMinimumRefresh(reloadHistory);
  // Lists are their own feature, kept on the server per device.
  const {
    lists,
    ready: listsReady,
    error: listsError,
    reload: reloadLists,
  } = useLists();
  const [openList, setOpenList] = useState<ListSummary | null>(null);
  const listsRefresh = useMinimumRefresh(reloadLists);
  const pull =
    page === "cart"
      ? cartRefresh
      : page === "lists"
        ? listsRefresh
        : page === "account"
          ? historyRefresh
          : browseRefresh;
  useEffect(() => {
    if (status === "success") Keyboard.dismiss();
  }, [status]);
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [page]);
  // Cart edit mode: the selected products, or null when not editing. Leaving the Cart page ends it.
  const [cartEditing, setCartEditing] = useState<ReadonlySet<string> | null>(
    null,
  );
  const navigate = useCallback((key: string) => {
    setPage(key);
    setCartEditing(null);
    Keyboard.dismiss();
  }, []);
  const startCartEdit = useCallback(() => setCartEditing(new Set()), []);
  const cartUrls = useMemo(() => products.map((p) => p.url), [products]);
  const editing = useMemo(
    () =>
      cartEditing && {
        selected: cartEditing,
        onToggle: (url: string) =>
          setCartEditing((current) => current && toggleSelected(current, url)),
        onSelectAll: () =>
          setCartEditing((current) => current && selectAll(current, cartUrls)),
        onDone: () => setCartEditing(null),
      },
    [cartEditing, cartUrls],
  );
  const removeSelected = () => {
    const urls = [...(cartEditing ?? [])];
    if (!urls.length) return;
    Alert.alert(
      urls.length === 1
        ? "Remove this product from your cart?"
        : `Remove ${urls.length} products from your cart?`,
      "They stay in your lists and history.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () =>
            void Promise.all(urls.map((url) => removeFromCart(url)))
              .then(reloadCart)
              .then(() => setCartEditing(null))
              .catch(() =>
                Alert.alert("Could not remove them", "Please try again."),
              ),
        },
      ],
    );
  };
  const navigateFromBrowser = useCallback(
    (key: string) => {
      if (key === "browse") {
        navigate(key);
        if (!browser && browserResume) setBrowser(browserResume);
        return;
      }
      // Keep the mounted WebView session for a round trip back to Browse.
      setBrowser(null);
      navigate(key);
    },
    [browser, browserResume, navigate],
  );
  // Stable callbacks for the memoized pages and store browsers; the latest capture state is read through a ref.
  const latest = useRef({ submit });
  latest.current = { submit };
  // Cart from a store opens over it, so the store page stays where it was.
  const [cartOpen, setCartOpen] = useState(false);
  const openCartFromBrowser = useCallback(() => setCartOpen(true), []);
  const captureFromBrowser = useCallback(
    (snapshot: Parameters<typeof submit>[1] & object) => {
      const rejected = latest.current.submit(snapshot.url, snapshot);
      if (!rejected) setPage("browse");
      return rejected;
    },
    [],
  );
  const browseStores = useCallback(() => navigate("browse"), [navigate]);
  const navigateFromMain = useCallback(
    (key: string) => {
      navigate(key);
      if (key === "browse" && !browser && browserResume)
        setBrowser(browserResume);
    },
    [browser, browserResume, navigate],
  );
  const send = (text: string) => {
    if (!/^https?:\/\//i.test(text.trim())) {
      note(
        "For now, paste a product link to capture it. Use the icons below to browse stores, open your cart or manage lists.",
      );
      return true;
    }
    if (submit(text)) return false;
    Keyboard.dismiss();
    setPage("cart");
    return true;
  };
  const available = Math.min(width - 32, 700);
  return (
    <MoryLookProvider look={mory.look}>
      <View style={s.root}>
        {browserSessions.map((target) => (
          <MerchantBrowser
            key={target.url}
            target={target}
            visible={browser?.url === target.url}
            busy={status === "loading" || !ready}
            failure={status === "error" ? message : undefined}
            captured={status === "success" ? lastProduct : undefined}
            onClose={closeBrowser}
            onOpenCart={openCartFromBrowser}
            onViewProduct={setViewing}
            messages={messages}
            onSend={send}
            leadingActionWidth={dockNavigationWidth(navigation.length)}
            leadingAction={
              <DockNavigation
                items={navigation}
                selectedKey={page}
                onSelect={navigateFromBrowser}
                onStep={tick}
              />
            }
            onDetent={tick}
            activity={
              status === "idle"
                ? undefined
                : {
                    id: lastUrl || "input",
                    state:
                      status === "loading"
                        ? "running"
                        : status === "success"
                          ? "done"
                          : "failed",
                  }
            }
            onCapture={captureFromBrowser}
          />
        ))}
        {/* Keep the decoration on the stable screen canvas. If it lived in body, changing the header height
          would change the scatter area and make every Mory jump while the layout settles. */}
        <MoryField density={1.8} sizes={[38, 92]} seed="cart" />
        {/* Same white and edge as the dock; its rounded foot squares off when the open dock meets it. */}
        {/* The header has no controls, so a tap on it is a tap outside the keyboard. */}
        <View
          style={[s.top, { paddingTop: insets.top }]}
          onStartShouldSetResponder={() => true}
          onResponderRelease={Keyboard.dismiss}
        >
          <View style={s.header}>
            <Brand tagline="Save it now, buy it right." />
            <Mory pose="wave" size={46} live />
          </View>
        </View>
        <View style={s.body}>
          <Animated.ScrollView
            ref={scroll}
            onScroll={tabBar.onScroll}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={[
              s.content,
              { paddingBottom: floatingTabBarSpace(insets.bottom) + 16 },
            ]}
            // Always present: on iOS, adding or removing the control shifts the content's position among the
            // ScrollView's children, and React would then remount every page on the switch.
            refreshControl={
              <PullToRefresh
                refreshing={pull.refreshing}
                onRefresh={pull.refresh}
              />
            }
          >
            <PageFade page={page} style={{ width: available }}>
              <View
                style={[
                  s.merchantList,
                  { display: page === "browse" ? "flex" : "none" },
                ]}
              >
                <MerchantPicker
                  catalog={merchants.catalog}
                  error={merchants.error}
                  onReload={merchants.reload}
                  onOpen={openBrowser}
                />
              </View>
              {/* Every page stays mounted: switching only shows it, so no views are created mid-animation. */}
              <View
                style={{ gap: 16, display: page === "cart" ? "flex" : "none" }}
              >
                <CartPage
                  products={products}
                  ready={ready}
                  width={available}
                  columns={width > 650 ? 3 : 2}
                  onBrowse={browseStores}
                  onOpen={setDetail}
                  onEdit={startCartEdit}
                  editing={editing}
                  refreshError={cartError}
                  onRetry={() => void reloadCart()}
                />
              </View>
              <View style={{ display: page === "account" ? "flex" : "none" }}>
                <AccountScreen
                  historyCount={viewed.length}
                  onOpenHistory={openHistory}
                  onCustomizeMory={openMory}
                />
              </View>
              <View style={{ display: page === "lists" ? "flex" : "none" }}>
                <ListsScreen
                  lists={lists}
                  ready={listsReady}
                  error={listsError}
                  onOpen={setOpenList}
                  onChanged={reloadLists}
                />
              </View>
              {storageError ? (
                <Copy accessibilityRole="alert">{storageError}</Copy>
              ) : null}
              {status === "loading" ? (
                <View style={s.status}>
                  <ActivityIndicator color={colors.accent} />
                  <Copy>{message}</Copy>
                </View>
              ) : null}
              {status === "error" ? (
                <View style={s.status}>
                  <Copy accessibilityRole="alert">{message}</Copy>
                  {canRetry ? <Button onPress={retry}>Try again</Button> : null}
                </View>
              ) : null}
            </PageFade>
          </Animated.ScrollView>
          {editing && page === "cart" ? (
            <CartEditBar
              count={editing.selected.size}
              bottomInset={insets.bottom}
              onAddToList={() => setSaving([...editing.selected])}
              onRemove={removeSelected}
            />
          ) : (
            <FloatingTabBar
              items={navigation}
              selectedKey={page}
              onSelect={navigateFromMain}
              onStep={tick}
              bottomInset={insets.bottom}
              compact={tabBar.compact}
              onExpand={tabBar.expand}
            />
          )}
        </View>
        {openList ? (
          <ListScreen
            key={openList.id}
            id={openList.id}
            name={openList.name}
            updatedAt={
              lists.find((list) => list.id === openList.id)?.updatedAt ??
              openList.updatedAt
            }
            onClose={() => setOpenList(null)}
            onOpen={setDetail}
            onChanged={reloadLists}
          />
        ) : null}
        {moryOpen ? (
          <MoryScreen
            look={mory.look}
            onChange={mory.setLook}
            onClose={() => setMoryOpen(false)}
          />
        ) : null}
        {historyOpen ? (
          <HistoryScreen
            products={viewed}
            onClose={() => setHistoryOpen(false)}
            onOpen={setDetail}
          />
        ) : null}
        {shownDetail ? (
          <ProductDetail
            key={shownDetail.url}
            product={shownDetail}
            store={storeFor(shownDetail.url, merchants.catalog).name}
            inCart={products.some((p) => p.url === shownDetail.url)}
            onClose={closeDetail}
            onShop={() =>
              openBrowser(storeFor(shownDetail.url, merchants.catalog))
            }
            onSave={() => saveOne(shownDetail.url)}
            onAddToCart={() => addProductToCart(shownDetail.url)}
            onRemove={() => removeProductFromCart(shownDetail.url)}
          />
        ) : null}
        <ProductModal
          product={viewing}
          store={viewing ? storeFor(viewing.url, merchants.catalog).name : ""}
          inCart={!!viewing && products.some((p) => p.url === viewing.url)}
          onClose={() => setViewing(null)}
          onSave={saveOne}
          onAddToCart={addProductToCart}
          onRemove={removeProductFromCart}
        />
        <CartModal
          visible={cartOpen}
          products={products}
          ready={ready}
          storeName={(url) => storeFor(url, merchants.catalog).name}
          onClose={() => setCartOpen(false)}
          onShop={(url) => {
            setCartOpen(false);
            openBrowser(storeFor(url, merchants.catalog));
          }}
          onSave={saveOne}
          onAddToCart={addProductToCart}
          onRemove={removeProductFromCart}
        />
        <ListPicker
          productUrls={saving}
          onClose={() => setSaving(null)}
          onSaved={() => setCartEditing(null)}
          onChanged={() => void reloadLists()}
        />
      </View>
    </MoryLookProvider>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  top: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.line,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    zIndex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  body: { flex: 1, position: "relative" },
  merchantList: { paddingTop: 16 },
  content: {
    paddingTop: 4,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  status: { paddingVertical: 20, gap: 10 },
});
