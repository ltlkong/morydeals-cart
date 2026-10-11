import { parseDocument } from 'htmlparser2';
import { selectAll, selectOne } from 'css-select';
import { textContent, removeElement } from 'domutils';
import type { AnyNode, Element } from 'domhandler';
import { parseExpressionAt } from 'acorn';

export type HtmlNode = AnyNode;
export const htmlDocument = parseDocument;
export const all = (root: AnyNode, selector: string): Element[] => selectAll(selector, root);
export const one = (root: AnyNode, selector: string): Element | null => selectOne(selector, root);
export const content = (node: AnyNode | null | undefined): string =>
  node ? textContent(node).replace(/\s+/g, ' ').trim() : '';
export const textAt = (root: AnyNode, selector: string): string => content(one(root, selector));
export const values = (root: AnyNode, selector: string, attribute: string): string[] => [
  ...new Set(
    all(root, selector)
      .map((node) => node.attribs[attribute]?.trim())
      .filter((v): v is string => !!v),
  ),
];
export function plainHtml(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const root = parseDocument(value);
  for (const node of all(root, 'script, style, noscript')) removeElement(node);
  return content(root) || undefined;
}

/** Parse a single JSON assignment boundary with Acorn, then strict JSON; never eval JS. */
export function assignedJson(root: AnyNode, name: string, optional = false): unknown {
  const matches: unknown[] = [];
  for (const script of all(root, 'script')) {
    const source = textContent(script);
    const pattern = new RegExp(`(?:^|[;\\s])window\\.${name}\\s*=\\s*`, 'g');
    for (const match of source.matchAll(pattern)) {
      const start = match.index! + match[0].length;
      const expression = parseExpressionAt(source, start, {
        ecmaVersion: 'latest',
      });
      matches.push(JSON.parse(source.slice(start, expression.end)));
    }
  }
  if (!matches.length && optional) return undefined;
  if (matches.length !== 1) throw new Error(`Missing or ambiguous ${name}`);
  return matches[0];
}
