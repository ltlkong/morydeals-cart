import { UserFacingError } from "../errors";
import {
  PageSnapshotSchema,
  type PageSnapshot,
  MAX_SNAPSHOT_BYTES,
} from "@morydeals/capture-contracts/snapshot";
/** The capture script's only message meant for the shopper; anything else it reports is the page's own error. */
export const CAPTURE_TOO_LARGE = "Page is too large to capture.";
const tooLarge = CAPTURE_TOO_LARGE;
const unreadable = "Could not read this page. Please try again.";
// The API limits UTF-8 bytes, not UTF-16 string length.
const byteLength = (text: string) => new TextEncoder().encode(text).length;
export function capturePageScript(requestId: string) {
  return `(() => {
    // Every page drops what parsing never reads before upload: styles, icon drawings, inline images and page code
    // (verified on all archived captures: identical parse results, a third smaller). JSON data, known store state and
    // all text and elements stay; a comment records the removal.
    const slim = () => {
      const copy = document.documentElement.cloneNode(true);
      copy.querySelectorAll('style, link[rel="stylesheet"], noscript, template').forEach((node) => node.remove());
      copy.querySelectorAll('svg').forEach((node) => { node.innerHTML = ''; });
      copy.querySelectorAll('[src^="data:"], [srcset^="data:"]').forEach((node) => { node.removeAttribute('src'); node.removeAttribute('srcset'); });
      copy.querySelectorAll('script').forEach((node) => {
        if (/json/i.test(node.getAttribute('type') || '')) return;
        const code = node.textContent || '';
        if (/__INITIAL_STATE__|__initialState__|__neweggState__|__NEXT_DATA__|Shopify\\.shop/.test(code)) return;
        if (node.src || code.length > 2000) node.remove();
      });
      return '<!-- mory: styles, icons, inline images and page code removed to fit the upload limit -->' + copy.outerHTML;
    };
    const send = (data) => window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: 'mory-page-capture', requestId: ${JSON.stringify(requestId)} }, data)));
    try {
      const size = (text) => new TextEncoder().encode(text).length;
      const html = slim();
      if (size(html) > ${MAX_SNAPSHOT_BYTES}) throw new Error(${JSON.stringify(tooLarge)});
      send({ url: location.href, html });
    } catch (error) { send({ error: String((error && error.message) || error) }); }
  })(); true;`;
}
/**
 * Packages the rendered page for upload; the server parses it. Page-supplied fields are untrusted: the capture time is
 * set here and the URL must stay on the browsed origin.
 */
export function toPageSnapshot(
  input: { url?: unknown; html?: unknown },
  pageUrl: string,
): PageSnapshot {
  const { url, html } = input;
  if (typeof url !== "string" || typeof html !== "string" || !URL.canParse(url))
    throw new UserFacingError(unreadable);
  if (new URL(url).origin !== new URL(pageUrl).origin)
    throw new UserFacingError("Page changed. Please capture again.");
  if (byteLength(html) > MAX_SNAPSHOT_BYTES)
    throw new UserFacingError(tooLarge);
  const snapshot = PageSnapshotSchema.safeParse({
    url,
    html,
    capturedAt: new Date().toISOString(),
  });
  if (!snapshot.success) throw new UserFacingError(unreadable);
  return snapshot.data;
}
