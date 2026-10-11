import { FiltersEngine } from "@ghostery/adblocker";
import { getDomain } from "tldts";
import rules from "./annoyance-rules.json";

/** Element ids, classes and link targets seen in the page; generic hide rules are matched against them. */
export type PageTokens = { ids: string[]; classes: string[]; hrefs: string[] };
export const COSMETIC_MESSAGE = "mory-cosmetic-dom";
/** Posted once a style pass is in place; the app keeps the page hidden until then. */
export const GUARD_READY_MESSAGE = "mory-cosmetic-ready";
const MAX_TOKENS = 4000;

// Cosmetic-only: no network blocking or third-party scriptlet execution.
let engine: FiltersEngine | undefined;
export function cosmeticStyles(url: string, page: PageTokens): string {
  const hostname = new URL(url).hostname;
  engine ??= FiltersEngine.parse(rules, {
    loadNetworkFilters: false,
    loadExtendedSelectors: false,
    loadGenericCosmeticsFilters: true,
  });
  return engine.getCosmeticsFilters({
    url,
    hostname,
    domain: getDomain(hostname) ?? hostname,
    ...page,
    getBaseRules: true,
    getRulesFromHostname: true,
    getRulesFromDOM: true,
    getInjectionRules: false,
    getExtendedRules: false,
  }).styles;
}

/** Validates a page message (untrusted) into bounded token lists. */
export function pageTokens(message: Record<string, unknown>): PageTokens {
  const list = (value: unknown) =>
    Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === "string")
          .slice(0, MAX_TOKENS)
      : [];
  return {
    ids: list(message.ids),
    classes: list(message.classes),
    hrefs: list(message.hrefs),
  };
}

const applyStyles = (url: string, css: string) => `(() => {
    if (location.hostname !== ${JSON.stringify(new URL(url).hostname)}) return;
    const id = 'mory-cosmetic-filter';
    let style = document.getElementById(id);
    if (!style) { style = document.createElement('style'); style.id = id; (document.head || document.documentElement).appendChild(style); }
    style.textContent = ${JSON.stringify(css)};
  })();`;
/** Applies `css` to the page (host guarded), then confirms the page is guarded. */
export function cosmeticStyleScript(url: string, css: string): string {
  return `${applyStyles(url, css)}
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: '${GUARD_READY_MESSAGE}' })); true;`;
}

const storeStyles = (url: string) =>
  cosmeticStyles(url, { ids: [], classes: [], hrefs: [] });
/** The store's own rules, applied before page content loads so its notices never render. */
export function earlyCosmeticScript(url: string): string {
  return `${applyStyles(url, storeStyles(url))} true;`;
}

/**
 * Applies the store's own rules at once, then reports the page's ids, classes and links (again whenever new elements
 * appear, as consent banners usually do) so the app can add matching generic rules.
 */
export function cosmeticScript(url: string): string {
  return `${applyStyles(url, storeStyles(url))}
  (() => {
    if (location.hostname !== ${JSON.stringify(new URL(url).hostname)} || window.__moryCosmetics) return;
    window.__moryCosmetics = true;
    const seen = { ids: new Set(), classes: new Set(), hrefs: new Set() };
    let timer = null;
    const report = () => {
      timer = null;
      const fresh = { ids: [], classes: [], hrefs: [] };
      for (const el of document.querySelectorAll('[id],[class],a[href]')) {
        if (el.id && !seen.ids.has(el.id) && seen.ids.size < ${MAX_TOKENS}) { seen.ids.add(el.id); fresh.ids.push(el.id); }
        for (const name of el.classList || []) if (!seen.classes.has(name) && seen.classes.size < ${MAX_TOKENS}) { seen.classes.add(name); fresh.classes.push(name); }
        const href = el.getAttribute && el.getAttribute('href');
        if (el.tagName === 'A' && href && !seen.hrefs.has(href) && seen.hrefs.size < ${MAX_TOKENS}) { seen.hrefs.add(href); fresh.hrefs.push(href); }
      }
      if (!fresh.ids.length && !fresh.classes.length && !fresh.hrefs.length) return;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: '${COSMETIC_MESSAGE}', ids: [...seen.ids], classes: [...seen.classes], hrefs: [...seen.hrefs] }));
    };
    const schedule = () => { if (!timer) timer = setTimeout(report, 300); };
    report();
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['id', 'class'] });
  })(); true;`;
}
