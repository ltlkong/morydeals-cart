import type { CheerioAPI } from 'cheerio';
import type TurndownService from 'turndown';

/** Prefer an enclosing product section only when the full page exceeds the LLM budget. */
export function productContent($: CheerioAPI, turndown: TurndownService, fullHtml: string) {
  const fullMarkdown = turndown.turndown(fullHtml);
  if (fullMarkdown.length <= 24000)
    return { markdown: fullMarkdown, scope: 'full', originalCharacters: fullMarkdown.length };

  // No merchant classes: use the single primary title and semantic product containers.
  const headings = $('main h1, [role="main"] h1');
  const title = headings.length ? headings : $('h1');
  if (title.length === 1) {
    const ancestors = title.parents(
      'section, article, product-info, [itemscope], main, [role="main"]',
    );
    const containers = ancestors.toArray().reverse();
    const isMain = (node: (typeof containers)[number]) =>
      node.tagName === 'main' || $(node).attr('role') === 'main';
    for (const node of [
      ...containers.filter((node) => !isMain(node)),
      ...containers.filter(isMain),
    ]) {
      const container = $(node);
      if (
        !container.find(
          'form[action*="/cart/add"], [itemprop="price"], [data-product-id], button[type="submit"]',
        ).length
      )
        continue;
      const markdown = turndown.turndown(container.html() ?? '');
      if (markdown.length <= 24000)
        return {
          markdown,
          scope: 'product-region',
          selector: node.tagName + (container.attr('id') ? `#${container.attr('id')}` : ''),
          originalCharacters: fullMarkdown.length,
        };
    }
  }
  // Preserve unresolvable large pages in full. The parser reports the limit, never truncates prices.
  return { markdown: fullMarkdown, scope: 'full', originalCharacters: fullMarkdown.length };
}
