import type { PageSnapshot } from "@morydeals/capture-contracts/snapshot";
import { useLocalState } from "./use-local-state";
import type { ChatMessage } from "@morydeals/ui";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { addToCart, getCart } from "./cart/cart-api";
import { userMessage } from "./errors";
import {
  CaptureRejectedError,
  isMobileProduct,
  productUrl,
  startCapture,
  waitForCapture,
  type MobileProduct,
} from "./products-api";
const validProducts = (value: unknown): value is MobileProduct[] =>
  Array.isArray(value) && value.every(isMobileProduct);
const MIGRATED = "mory.cart.migrated.v1";
type CaptureJob = { url: string; snapshot?: PageSnapshot; id?: string };
export function useProducts() {
  const {
    value: products,
    setValue: setProducts,
    ready,
    error: storageError,
  } = useLocalState<MobileProduct[]>("mory.products.v1", [], validProducts);
  // The server cart is the source of truth; the local list is an offline cache shown until it loads.
  const [cartError, setCartError] = useState("");
  const localProducts = useRef(products);
  localProducts.current = products;
  const reloadCart = useCallback(async () => {
    try {
      let server = await getCart();
      // Once per device: upload products saved before the server cart existed.
      if (!(await AsyncStorage.getItem(MIGRATED).catch(() => null))) {
        const known = new Set(server.map((p) => p.url));
        const pending = localProducts.current.filter((p) => !known.has(p.url));
        for (const product of pending) await addToCart(product.url);
        await AsyncStorage.setItem(MIGRATED, "1").catch(() => undefined);
        if (pending.length) server = await getCart();
      }
      setProducts(server);
      setCartError("");
    } catch (failure) {
      // The cart saved on this phone stays on screen; the Cart page says why it is not current.
      setCartError(
        userMessage(
          failure,
          "Your cart could not be refreshed. Please try again.",
        ),
      );
    }
  }, [setProducts]);
  useEffect(() => {
    if (ready) void reloadCart();
  }, [ready, reloadCart]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Browse a store or paste a product link. I’ll bring the details here.",
    },
  ]);
  const note = (text: string) =>
    setMessages((items) => [
      ...items,
      { id: `note-${Date.now()}`, role: "assistant", text },
    ]);
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const [lastUrl, setLastUrl] = useState("");
  const [lastProduct, setLastProduct] = useState<MobileProduct>();
  const [canRetry, setCanRetry] = useState(false);
  const lastJob = useRef<CaptureJob | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [],
  );
  const start = (job: CaptureJob) => {
    lastJob.current = job;
    const replyId = `reply-${Date.now()}`;
    setMessages((items) => [
      ...items,
      { id: `user-${replyId}`, role: "user", text: job.url },
      {
        id: replyId,
        role: "assistant",
        text: "Finding your product and its price…",
      },
    ]);
    const reply = (text: string) =>
      setMessages((items) =>
        items.map((item) => (item.id === replyId ? { ...item, text } : item)),
      );
    const controller = new AbortController();
    active.current = controller;
    setLastUrl(job.url);
    setLastProduct(undefined);
    setStatus("loading");
    setCanRetry(false);
    setMessage("Finding your product and its price…");
    const timeout = setTimeout(() => controller.abort(), 180000);
    void (async () => {
      job.id ??= await startCapture(job.url, controller.signal, job.snapshot);
      return waitForCapture(job.id, controller.signal);
    })()
      .then((product) => {
        if (controller.signal.aborted) return;
        setProducts((previous) => [
          product,
          ...previous.filter((item) => item.url !== product.url),
        ]);
        setLastProduct(product);
        reply(`Found ${product.title}. Your product is ready in Cart.`);
        setStatus("success");
      })
      .catch((error: unknown) => {
        if (active.current !== controller) return;
        const rejected = error instanceof CaptureRejectedError;
        // Retrying a rejected job starts over; snapshots expire and would fail the same way, so recapture instead.
        if (rejected) job.id = undefined;
        setCanRetry(!(rejected && job.snapshot));
        reply(
          job.snapshot
            ? "I couldn’t capture this page. Open the store and try capturing again."
            : "I couldn’t capture this product. Please check the link and try again.",
        );
        setStatus("error");
        setMessage(
          controller.signal.aborted
            ? "This is taking longer than expected. Please try again."
            : userMessage(error, "Something went wrong. Please try again."),
        );
      })
      .finally(() => {
        clearTimeout(timeout);
        if (active.current === controller) active.current = null;
      });
  };
  /** Returns why the capture was not started, or undefined once it is running. */
  const submit = (
    value: string,
    snapshot?: PageSnapshot,
  ): string | undefined => {
    if (active.current) return "Mory is still working on your last product.";
    if (!ready) return "Your saved products are still loading.";
    let url: string;
    try {
      url = productUrl(value);
    } catch (error) {
      setLastUrl("");
      setStatus("error");
      setCanRetry(false);
      const message = userMessage(error, "Paste a complete product link.");
      setMessage(message);
      return message;
    }
    start({ url, snapshot });
    return undefined;
  };
  return {
    products,
    status,
    message,
    submit,
    canRetry,
    retry: () => {
      if (lastJob.current && !active.current && ready) start(lastJob.current);
    },
    lastUrl,
    lastProduct,
    messages,
    note,
    ready,
    storageError,
    cartError,
    reloadCart,
  };
}
