import {
  CAPTURE_TOO_LARGE,
  capturePageScript,
  toPageSnapshot,
} from "./capture-page";
import { UserFacingError, userMessage } from "../errors";
import {
  knownPage,
  shouldVisit,
  visitLink,
  visitPage,
  type VisitResult,
} from "./visits-api";
import {
  SELECTION_MESSAGE,
  selectionWatchScript,
  stopSelectionWatchScript,
} from "./selection-watch";
import { nextWatch, type SelectionWatch } from "./selection-visits";
import { mediaGuardScript, pauseMediaScript } from "./filtering/media";
import type { MobileProduct } from "../products-api";
import { money } from "../money";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { EDGE_WIDTH, closesOnRelease } from "../product/swipe-back";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import * as Haptics from "expo-haptics";
import {
  ArrowLeft,
  PackagePlus,
  House,
  RotateCw,
  ShoppingBag,
} from "lucide-react-native";
import {
  Button,
  Copy,
  MoryFab,
  PageStrip,
  PAGE_STRIP_HEIGHT,
  colors,
} from "@morydeals/ui";
import { productUrl } from "../products-api";
import {
  COSMETIC_MESSAGE,
  GUARD_READY_MESSAGE,
  cosmeticScript,
  cosmeticStyleScript,
  earlyCosmeticScript,
  cosmeticStyles,
  pageTokens,
} from "./filtering/cosmetics";
import type { MerchantBrowserProps } from "./MerchantBrowser";

const tap = () => {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
    () => undefined,
  );
};
function NativeMerchantBrowser({
  target,
  visible,
  busy,
  failure,
  captured,
  onClose,
  onCapture,
  pageUploads = false,
  onOpenCart,
  onViewProduct,
}: MerchantBrowserProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  // A stack screen: it slides in from the right when shown and out when closed, and stays above the app until
  // it has left. Hidden stores stay mounted off screen, keeping their pages.
  // Starts off screen even when first mounted visible, so the first opening slides in too.
  const offset = useSharedValue(screenWidth);
  const [onTop, setOnTop] = useState(visible);
  useEffect(() => {
    if (visible) {
      setOnTop(true);
      offset.value = withTiming(0, SLIDE_IN);
    } else
      offset.value = withTiming(screenWidth, SLIDE_OUT, (done) => {
        if (done) scheduleOnRN(setOnTop, false);
      });
  }, [visible, offset, screenWidth]);
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));
  const web = useRef<WebView>(null);
  const pageSource = useMemo(() => ({ uri: target.url }), [target.url]);
  const [current, setCurrent] = useState(target.url);
  const [back, setBack] = useState(false);
  const [loading, setLoading] = useState(true);
  // A loading page stays hidden until the notice filter has run, so banners never flash; a stalled filter
  // (blocked scripts, slow page) still shows the page shortly after it finishes loading.
  const [guarded, setGuarded] = useState(false);
  useEffect(() => {
    if (guarded || loading) return;
    const timer = setTimeout(() => setGuarded(true), 800);
    return () => clearTimeout(timer);
  }, [guarded, loading]);
  const [error, setError] = useState("");
  // Capture problems stay separate from page-load errors so they never lock Capture behind a reload.
  const [captureError, setCaptureError] = useState("");
  const [capturing, setCapturing] = useState(false);
  // Automatic visits: each settled page is checked once; a product page fills the strip and is kept in history.
  const [found, setFound] = useState<{
    page: string;
    product: MobileProduct;
  } | null>(null);
  const [visiting, setVisiting] = useState(false);
  const visited = useRef(new Set<string>());
  // A page read before it finished rendering is read again, a couple of times at most.
  const rereads = useRef(new Map<string, number>());
  const [reread, setReread] = useState(0);
  const pendingVisit = useRef<{ id: string; page: string } | null>(null);
  // Pages read again on purpose (a choice was made, or it had not rendered): never answered from the catalogue.
  const reading = useRef(new Set<string>());
  const visitAbort = useRef<AbortController | null>(null);
  useEffect(() => () => visitAbort.current?.abort(), []);
  const strip = found && found.page === current ? found.product : null;
  // A product page waiting for a size, colour or configuration choice: each choice reads it again.
  const [watch, setWatch] = useState<SelectionWatch | null>(null);
  const watchRef = useRef<SelectionWatch | null>(null);
  const updateWatch = (
    event:
      | { type: "result"; page: string; kind: VisitResult["kind"] }
      | { type: "selection"; current: string; visiting: boolean },
  ) => {
    const next = nextWatch(watchRef.current, event);
    watchRef.current = next.watch;
    setWatch(next.watch);
    if (next.start) web.current?.injectJavaScript(selectionWatchScript());
    if (next.stop) web.current?.injectJavaScript(stopSelectionWatchScript());
    if (next.reread && next.watch) {
      reading.current.add(next.watch.page);
      visited.current.delete(next.watch.page);
      setReread((value) => value + 1);
    }
  };
  // Leaving the page ends its wait.
  useEffect(() => {
    if (!watchRef.current || watchRef.current.page === current) return;
    watchRef.current = null;
    setWatch(null);
    web.current?.injectJavaScript(stopSelectionWatchScript());
  }, [current]);
  // A visit's outcome: a product fills the strip; an unconfirmed page is read again, a couple of times at most.
  const settleVisit = (
    page: string,
    start: (signal: AbortSignal) => Promise<VisitResult>,
  ) => {
    visitAbort.current?.abort();
    const abort = new AbortController();
    visitAbort.current = abort;
    setVisiting(true);
    void start(abort.signal)
      .then((result) => {
        if (result.kind === "product")
          setFound({ page, product: result.product });
        updateWatch({ type: "result", page, kind: result.kind });
        const count = rereads.current.get(page) ?? 0;
        if (result.kind === "unconfirmed" && count < 2) {
          rereads.current.set(page, count + 1);
          setTimeout(() => {
            reading.current.add(page);
            visited.current.delete(page);
            setReread((value) => value + 1);
          }, 2500);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (visitAbort.current === abort) setVisiting(false);
      });
  };
  useEffect(() => {
    if (!visible || loading || error) return;
    const page = current;
    if (!shouldVisit(page) || visited.current.has(page)) return;
    const read = () => {
      // Uploads paused: only the link goes; the worker fetches the page itself.
      if (!pageUploads)
        return settleVisit(page, (signal) => visitLink(page, signal));
      const id = `visit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      pendingVisit.current = { id, page };
      setVisiting(true);
      web.current?.injectJavaScript(capturePageScript(id));
    };
    // Let client-side rendering settle before reading the page.
    const timer = setTimeout(() => {
      visited.current.add(page);
      if (reading.current.delete(page)) return read();
      // A page captured recently is answered from the catalogue, without uploading it.
      visitAbort.current?.abort();
      const abort = new AbortController();
      visitAbort.current = abort;
      setVisiting(true);
      void knownPage(page, abort.signal).then((known) => {
        if (abort.signal.aborted) return;
        if (known?.kind === "product") {
          setFound({ page, product: known.product });
          setVisiting(false);
        } else read();
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, [visible, loading, error, current, reread, pageUploads]);
  // Capture keeps the store open; a short notice confirms the page was sent.
  const [notice, setNotice] = useState("");
  // Set when this store sent a capture; its outcome is then reported here, where the shopper is looking.
  // Holds the page the pending capture came from, so its product fills the strip there.
  const awaiting = useRef<string | null>(null);
  useEffect(() => {
    if (!awaiting.current || busy) return;
    const page = awaiting.current;
    awaiting.current = null;
    if (failure) setCaptureError(failure);
    else {
      setNotice("Added to Cart.");
      if (captured) {
        setFound({ page, product: captured });
      }
    }
  }, [busy, failure, captured]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(timer);
  }, [notice]);
  const pendingCapture = useRef<{
    id: string;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  useEffect(
    () => () => {
      if (pendingCapture.current) clearTimeout(pendingCapture.current.timer);
    },
    [],
  );
  const captureCurrentPage = () => {
    if (pendingCapture.current || busy || loading) return;
    // Uploads paused: Capture sends the link, never the page; the worker fetches the desktop page.
    if (!pageUploads) {
      setCaptureError("");
      const rejected = onCapture({ url: current });
      if (rejected) setCaptureError(rejected);
      else {
        awaiting.current = current;
        setNotice("Sent to Mory — it will appear in Cart.");
      }
      return;
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setCapturing(true);
    setCaptureError("");
    const timer = setTimeout(() => {
      pendingCapture.current = null;
      setCapturing(false);
      setCaptureError("Could not read this page. Please try again.");
    }, 15000);
    pendingCapture.current = { id, timer };
    web.current?.injectJavaScript(capturePageScript(id));
  };
  // Notices are always hidden: store rules at once, generic rules as the page reports its elements.
  const script = useMemo(() => cosmeticScript(current), [current]);
  const earlyScript = useMemo(
    () => `${mediaGuardScript}\n${earlyCosmeticScript(current)}`,
    [current],
  );
  // A hidden store keeps running; stop anything it is playing.
  useEffect(() => {
    if (!visible) web.current?.injectJavaScript(pauseMediaScript);
  }, [visible]);
  const goBack = useCallback(() => {
    if (back) web.current?.goBack();
    else onClose();
  }, [back, onClose]);
  useEffect(() => {
    web.current?.injectJavaScript(script);
  }, [script]);
  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        goBack();
        return true;
      },
    );
    return () => subscription.remove();
  }, [visible, goBack]);
  // Swipe back from the left edge closes the store, but only on its first page: with history, the web view's own
  // edge swipe goes back a page, as in Safari.
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .enabled(visible && !back)
        .hitSlop({ left: 0, width: EDGE_WIDTH })
        .activeOffsetX(10)
        .failOffsetY([-20, 20])
        .onUpdate((event) => {
          offset.value = Math.max(0, event.translationX);
        })
        .onEnd((event) => {
          if (closesOnRelease(event.translationX, event.velocityX, screenWidth))
            offset.value = withTiming(screenWidth, SLIDE_OUT, (done) => {
              if (done) scheduleOnRN(onClose);
            });
          else offset.value = withSpring(0, { damping: 40, stiffness: 420 });
        }),
    [visible, back, offset, screenWidth, onClose],
  );
  return (
    <GestureDetector gesture={swipe}>
      <Animated.View
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? "yes" : "no-hide-descendants"}
        accessibilityViewIsModal={visible}
        pointerEvents={visible ? "auto" : "none"}
        style={[
          s.root,
          {
            paddingTop: insets.top,
            opacity: onTop ? 1 : 0,
            zIndex: onTop ? 100 : -1,
          },
          slide,
        ]}
      >
        <PageStrip
          merchant={{ name: target.name, logoUrl: target.logoUrl }}
          hint={
            !strip && watch?.page === current
              ? "Choose options to see the price"
              : undefined
          }
          busy={visiting}
          product={
            strip
              ? {
                  title: strip.title,
                  imageUrl: strip.images[0],
                  price: strip.offers[0]
                    ? money(
                        strip.offers[0].amountMinor,
                        strip.offers[0].currency,
                      )
                    : undefined,
                  was:
                    strip.offers[0]?.compareAtAmountMinor &&
                    strip.offers[0].compareAtAmountMinor >
                      strip.offers[0].amountMinor
                      ? money(
                          strip.offers[0].compareAtAmountMinor,
                          strip.offers[0].currency,
                        )
                      : undefined,
                }
              : undefined
          }
          onView={
            strip && onViewProduct ? () => onViewProduct(strip) : undefined
          }
        />
        <WebView
          ref={web}
          source={pageSource}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          style={[s.web, { opacity: guarded || error ? 1 : 0 }]}
          allowsBackForwardNavigationGestures={back}
          // iOS may end a hidden store's web process under memory pressure; reload it rather than show a blank page.
          onContentProcessDidTerminate={() => web.current?.reload()}
          // iOS otherwise hands any playing video (store autoplay clips, ads) to the fullscreen player.
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction
          allowsPictureInPictureMediaPlayback={false}
          originWhitelist={["*"]}
          onShouldStartLoadWithRequest={(request) =>
            /^https?:\/\//i.test(request.url)
          }
          onOpenWindow={(event) => {
            try {
              // Navigate in place; resetting `source` to an unchanged URL would be a no-op.
              const url = productUrl(event.nativeEvent.targetUrl);
              web.current?.injectJavaScript(
                `location.href = ${JSON.stringify(url)}; true;`,
              );
            } catch {
              setError("This link cannot open here.");
            }
          }}
          injectedJavaScriptBeforeContentLoaded={earlyScript}
          // Embedded players (iframes) get the media guard too; the notice rules are host guarded.
          injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
          injectedJavaScript={script}
          onMessage={(event) => {
            let data: Record<string, unknown> | null;
            try {
              // Other scripts on the page may post their own messages; ignore them.
              data = JSON.parse(event.nativeEvent.data);
            } catch {
              return;
            }
            if (data?.type === SELECTION_MESSAGE) {
              updateWatch({ type: "selection", current, visiting });
              return;
            }
            if (data?.type === GUARD_READY_MESSAGE) {
              setGuarded(true);
              return;
            }
            if (data?.type === COSMETIC_MESSAGE) {
              // Page names are only lookup keys; the injected CSS comes from the filter list.
              web.current?.injectJavaScript(
                cosmeticStyleScript(
                  current,
                  cosmeticStyles(current, pageTokens(data)),
                ),
              );
              return;
            }
            if (
              data?.type === "mory-page-capture" &&
              pendingVisit.current &&
              data.requestId === pendingVisit.current.id
            ) {
              const { page } = pendingVisit.current;
              pendingVisit.current = null;
              let snapshot;
              try {
                snapshot = toPageSnapshot(data, page);
              } catch {
                setVisiting(false);
                return;
              }
              settleVisit(page, (signal) => visitPage(snapshot, signal));
              return;
            }
            if (!pendingCapture.current) return;
            try {
              if (
                data?.type !== "mory-page-capture" ||
                data.requestId !== pendingCapture.current.id
              )
                return;
              clearTimeout(pendingCapture.current.timer);
              pendingCapture.current = null;
              setCapturing(false);
              // The page script reports our own "too large" message, or whatever the page itself threw.
              if (data.error)
                throw data.error === CAPTURE_TOO_LARGE
                  ? new UserFacingError(CAPTURE_TOO_LARGE)
                  : new Error("page script failed");
              const rejected = onCapture(toPageSnapshot(data, current));
              if (rejected) setCaptureError(rejected);
              else {
                awaiting.current = current;
                setNotice("Sent to Mory — it will appear in Cart.");
              }
            } catch (error) {
              if (pendingCapture.current)
                clearTimeout(pendingCapture.current.timer);
              pendingCapture.current = null;
              setCapturing(false);
              setCaptureError(
                userMessage(
                  error,
                  "Could not read this page. Please try again.",
                ),
              );
            }
          }}
          onLoadStart={() => {
            setLoading(true);
            setGuarded(false);
            setError("");
            setCaptureError("");
          }}
          onLoadEnd={() => {
            setLoading(false);
            web.current?.injectJavaScript(script);
          }}
          onNavigationStateChange={(state) => {
            if (/^https?:\/\//i.test(state.url)) setCurrent(state.url);
            setBack(state.canGoBack);
            setLoading(state.loading);
          }}
          onError={() => {
            setLoading(false);
            setError("This page could not load.");
          }}
          onHttpError={(event) => {
            if (event.nativeEvent.url === current)
              setError("The store could not open this page.");
          }}
        />
        {error ? (
          <View style={[s.error, { top: insets.top + PAGE_STRIP_HEIGHT + 8 }]}>
            <Copy accessibilityRole="alert">{error}</Copy>
            <Button onPress={() => web.current?.reload()}>Reload</Button>
          </View>
        ) : captureError ? (
          <View style={[s.error, { top: insets.top + PAGE_STRIP_HEIGHT + 8 }]}>
            <Copy accessibilityRole="alert">{captureError}</Copy>
            <Button secondary onPress={() => setCaptureError("")}>
              Dismiss
            </Button>
          </View>
        ) : notice ? (
          <View
            pointerEvents="none"
            accessibilityLiveRegion="polite"
            style={[s.notice, { top: insets.top + PAGE_STRIP_HEIGHT + 44 }]}
          >
            <Copy weight="bold" style={s.noticeText}>
              {notice}
            </Copy>
          </View>
        ) : null}
        {/* The store page gets the whole screen; its actions live behind Mory. */}
        <MoryFab
          label="Open Mory actions"
          closeLabel="Close Mory actions"
          bottomInset={insets.bottom}
          onTap={tap}
          actions={[
            {
              id: "capture",
              label: loading
                ? "Page loading…"
                : busy || capturing
                  ? "Capturing…"
                  : "Capture this product",
              icon: PackagePlus,
              tone: "accent",
              disabled: loading || !!error || busy || capturing,
              onPress: captureCurrentPage,
            },
            {
              id: "back",
              label: "Previous page",
              icon: ArrowLeft,
              disabled: !back,
              onPress: () => web.current?.goBack(),
            },
            {
              id: "reload",
              label: "Reload page",
              icon: RotateCw,
              onPress: () => web.current?.reload(),
            },
            ...(onOpenCart
              ? [
                  {
                    id: "cart",
                    label: "Cart",
                    icon: ShoppingBag,
                    onPress: onOpenCart,
                  },
                ]
              : []),
            {
              id: "home",
              label: "Home",
              icon: House,
              onPress: onClose,
            },
          ]}
        />
      </Animated.View>
    </GestureDetector>
  );
}
const SLIDE_IN = { duration: 260, easing: Easing.out(Easing.cubic) };
const SLIDE_OUT = { duration: 220, easing: Easing.in(Easing.quad) };
const s = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: colors.background,
  },
  web: { flex: 1 },
  error: {
    position: "absolute",
    left: 16,
    right: 16,
    padding: 12,
    gap: 8,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  notice: {
    position: "absolute",
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.ink,
  },
  noticeText: { color: colors.surface, fontSize: 13 },
});

/** The dock props (messages, navigation, activity) are web-only; a tab switch must not re-render every open store. */
const READ: (keyof MerchantBrowserProps)[] = [
  "target",
  "visible",
  "busy",
  "failure",
  "captured",
  "onClose",
  "onCapture",
  "onOpenCart",
  "onViewProduct",
];
export const MerchantBrowser = memo(NativeMerchantBrowser, (before, after) =>
  READ.every((key) => before[key] === after[key]),
);
