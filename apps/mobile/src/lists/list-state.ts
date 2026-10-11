import type { ListSummary } from "./lists-api";

/** The picker's optimistic view: `id` now does (or does not) hold the product, with its count adjusted once. */
export function withMembership(
  lists: readonly ListSummary[],
  id: string,
  contains: boolean,
): ListSummary[] {
  return lists.map((list) =>
    list.id !== id || !!list.contains === contains
      ? list
      : {
          ...list,
          contains,
          itemCount: Math.max(0, list.itemCount + (contains ? 1 : -1)),
        },
  );
}
