/** Posted when the shopper made a choice on the page and it settled; it carries nothing about the page. */
export const SELECTION_MESSAGE = "mory-selection-changed";

/**
 * Listens for the shopper's choices (taps and option changes) on a product page waiting for one. After a choice, it
 * waits for the page to stop changing for a second (three at most), then tells the app to read the page again.
 * Installed once per page; page changes without a choice are never reported.
 */
export function selectionWatchScript() {
  return `(() => {
    if (window.__moryWatch) return;
    let timer = null;
    let deadline = 0;
    const send = () => {
      timer = null;
      deadline = 0;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: ${JSON.stringify(SELECTION_MESSAGE)} }));
    };
    const settle = () => {
      const now = Date.now();
      if (!deadline) deadline = now + 3000;
      clearTimeout(timer);
      timer = setTimeout(send, Math.max(0, Math.min(1000, deadline - now)));
    };
    const changed = () => { if (timer) settle(); };
    const observer = new MutationObserver(changed);
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    document.addEventListener('click', settle, true);
    document.addEventListener('change', settle, true);
    window.__moryWatch = {
      stop: () => {
        clearTimeout(timer);
        observer.disconnect();
        document.removeEventListener('click', settle, true);
        document.removeEventListener('change', settle, true);
        window.__moryWatch = null;
      },
    };
  })(); true;`;
}
export function stopSelectionWatchScript() {
  return `(() => { if (window.__moryWatch) window.__moryWatch.stop(); })(); true;`;
}
