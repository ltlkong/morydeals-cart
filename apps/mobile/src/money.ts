/**
 * A minor-unit amount as a price label with its currency's symbol for Canadian shoppers (Intl's CLDR data, no symbol
 * table of our own): 1709 CAD → "$17.09", USD → "US$17.09", EUR → "€17.09".
 */
export function money(amount: number, currency: string) {
  const formatter = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
  });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(amount / 10 ** digits);
}
