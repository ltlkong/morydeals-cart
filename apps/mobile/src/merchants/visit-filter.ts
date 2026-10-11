/** Pages that can hold personal data or are never products; automatic visits skip them before upload. */
const PRIVATE_PATH =
  /\/(?:account|accounts|sign-?in|log-?in|login|register|signup|password|cart|basket|bag|checkout|payment|orders?|order-history|wishlist|gp\/(?:cart|buy|css|your-account|yourstore)|ap\/signin)\b/i;
export const shouldVisit = (url: string) =>
  /^https?:\/\//i.test(url) && !PRIVATE_PATH.test(new URL(url).pathname);
