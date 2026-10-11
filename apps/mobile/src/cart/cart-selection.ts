/** Edit-mode selection of cart products, by URL. Always a new set, so React re-renders. */
export function toggleSelected(
  selected: ReadonlySet<string>,
  url: string,
): Set<string> {
  const next = new Set(selected);
  if (next.has(url)) next.delete(url);
  else next.add(url);
  return next;
}

/** "Select all" when not every product is selected, otherwise "Deselect all". */
export function selectAll(
  selected: ReadonlySet<string>,
  urls: readonly string[],
): Set<string> {
  return urls.every((url) => selected.has(url)) ? new Set() : new Set(urls);
}
