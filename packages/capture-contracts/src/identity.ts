/**
 * Query parameters that only say where a visit came from. They never select a different product or variant, so
 * they are dropped from product URLs (which are product identities); every other parameter is kept as it was.
 */
const TRACKING = [
  /^utm_/i,
  /^(?:gclid|gclsrc|gbraid|wbraid|dclid|fbclid|msclkid|ttclid|twclid|yclid|igshid)$/i,
  /^(?:mc_cid|mc_eid|_ga|_gl|_hsenc|_hsmi|_kx|srsltid|epik)$/i,
  /^(?:ref|ref_|referrer|affiliate|aff_id|irclickid|clickid|cmpid|icid)$/i,
  /^(?:_pos|_sid|_ss|_psq|_fid)$/i,
  /^pr_(?:prod_strat|rec_id|rec_pid|ref_pid|seq)$/i,
];
/** A product URL as its identity: no fragment, no tracking parameters. */
export function identityUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (TRACKING.some((pattern) => pattern.test(key)))
      url.searchParams.delete(key);
  if (![...url.searchParams.keys()].length) url.search = "";
  return url.href;
}
