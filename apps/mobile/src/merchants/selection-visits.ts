import type { VisitResult } from "./visit-result";

/** A product page waiting for the shopper's choice: how often it has been read again, and a choice made meanwhile. */
export type SelectionWatch = { page: string; rereads: number; dirty: boolean };
export const MAX_SELECTION_REREADS = 5;

type Event =
  | { type: "result"; page: string; kind: VisitResult["kind"] }
  | { type: "selection"; current: string; visiting: boolean };

/**
 * What the store browser does next while a product page waits for a size, colour or configuration choice: whether to
 * read the page again, and whether to start or stop listening for choices on it.
 */
export function nextWatch(
  watch: SelectionWatch | null,
  event: Event,
): {
  watch: SelectionWatch | null;
  reread: boolean;
  start: boolean;
  stop: boolean;
} {
  const same = (page: string) => watch?.page === page;
  const reread = (current: SelectionWatch) =>
    current.rereads < MAX_SELECTION_REREADS
      ? {
          watch: { ...current, rereads: current.rereads + 1, dirty: false },
          reread: true,
        }
      : { watch: { ...current, dirty: false }, reread: false };
  if (event.type === "selection") {
    if (!watch || !same(event.current))
      return { watch, reread: false, start: false, stop: false };
    // One read at a time; the latest choice is read when the current read returns.
    if (event.visiting)
      return {
        watch: { ...watch, dirty: true },
        reread: false,
        start: false,
        stop: false,
      };
    return { ...reread(watch), start: false, stop: false };
  }
  if (event.kind === "needs_selection") {
    if (!watch || !same(event.page))
      return {
        watch: { page: event.page, rereads: 0, dirty: false },
        reread: false,
        start: true,
        stop: false,
      };
    return watch.dirty
      ? { ...reread(watch), start: false, stop: false }
      : { watch, reread: false, start: false, stop: false };
  }
  // An unconfirmed read is still waiting; a product or a non-product page ends the wait.
  if (!same(event.page) || event.kind === "unconfirmed")
    return { watch, reread: false, start: false, stop: false };
  return { watch: null, reread: false, start: false, stop: true };
}
