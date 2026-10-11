import { displayedMinorUnits } from '../money.ts';

/** The source line holding the quoted price, and the price's position in it. */
function quotedLine(source: string, quote: { priceText: string; evidence: string }) {
  const start = source.indexOf(quote.evidence);
  const offset = quote.evidence.indexOf(quote.priceText);
  if (start < 0 || offset < 0) return;
  const priceStart = start + offset;
  const lineStart = source.lastIndexOf('\n', priceStart - 1) + 1;
  const lineEnd = source.indexOf('\n', priceStart + quote.priceText.length);
  return {
    lineStart,
    line: source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd),
    position: priceStart - lineStart,
  };
}
const struckAt = (line: string, position: number) =>
  [...line.matchAll(/~{1,2}[^~\n]+~{1,2}/g)].some(
    (match) => match.index! <= position && match.index! + match[0].length > position,
  );
/** The quoted price is struck through in the source, whether or not the model's excerpt kept the tildes. */
export function struckInSource(source: string, quote: { priceText: string; evidence: string }) {
  const found = quotedLine(source, quote);
  return Boolean(found && struckAt(found.line, found.position));
}

/** Verify the role of the quoted number, including labels outside a model's short excerpt. */
export function currentPriceEvidence(
  source: string,
  quote: {
    priceText: string;
    evidence: string;
    amountMinor: number;
    currency: string;
  },
): string | undefined {
  const found = quotedLine(source, quote);
  if (!found) return;
  const { line, lineStart, position } = found;
  // A model can omit the tildes/role label from its excerpt; inspect the actual source line.
  if (struckAt(line, position)) return;
  const prefix = line.slice(0, position);
  if (
    /\b(was|original(?: price)?|list price|rrp|msrp|save|savings|starting from|payments? of|installments? of)\s*[:：]?\s*(?:[A-Z]{3}\s*)?$/i.test(
      prefix,
    )
  )
    return;
  // Labels may be included inside priceText rather than before it.
  if (
    /^(?:was|original|list price|save|savings|starting from|payments? of|installments? of)\b/i.test(
      quote.priceText,
    )
  )
    return;
  if (!/\bregular(?: price)?\s*[:：]?\s*(?:[A-Z]{3}\s*)?$/i.test(prefix)) return quote.evidence;

  // Regular price is not intrinsically a former price. Compare only the nearby price block,
  // stopping at headings, rather than accepting a matching price from a recommendation.
  const priceLines: string[] = [];
  for (const next of source.slice(lineStart).split('\n')) {
    if (!next.trim()) continue;
    if (
      !/^(?:regular(?: price)?|sale price|current price|now|was|original|list price|you save|save|savings|[~$£€¥]|[A-Z]{3}\s*[$£€¥]?\s*\d)/i.test(
        next.trim(),
      )
    )
      break;
    priceLines.push(next);
  }
  const after = priceLines.join('\n');
  const explicit = [
    ...after.matchAll(
      /\b(?:sale price|current price(?: is)?(?: now)?|now)\s*[:：]?\s*((?:[A-Z]{3}\s*)?[$£€¥]?\s*\d[\d,]*(?:\.\d+)?)/gi,
    ),
  ];
  if (!explicit.length) return quote.evidence;
  if (explicit.some((m) => displayedMinorUnits(m[1], quote.currency) !== quote.amountMinor)) return;
  return explicit[0][0];
}
