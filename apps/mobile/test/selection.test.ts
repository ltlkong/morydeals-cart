import { test, mock } from "node:test";
import assert from "node:assert/strict";
import {
  SELECTION_MESSAGE,
  selectionWatchScript,
  stopSelectionWatchScript,
} from "../src/merchants/selection-watch";
import {
  MAX_SELECTION_REREADS,
  nextWatch,
  type SelectionWatch,
} from "../src/merchants/selection-visits";
import { visitResult } from "../src/merchants/visit-result";

const page = "https://m.shein.com/ca/sweatshirt-p-1.html";

test("a page waiting for a choice starts a watch; a product or a non-product page ends it", () => {
  const started = nextWatch(null, {
    type: "result",
    page,
    kind: "needs_selection",
  });
  assert.deepEqual(started, {
    watch: { page, rereads: 0, dirty: false },
    reread: false,
    start: true,
    stop: false,
  });
  for (const kind of ["product", "none"] as const) {
    const ended = nextWatch(started.watch, { type: "result", page, kind });
    assert.equal(ended.watch, null, kind);
    assert.equal(ended.stop, true, kind);
  }
  // An unconfirmed read keeps waiting for the choice.
  const kept = nextWatch(started.watch, {
    type: "result",
    page,
    kind: "unconfirmed",
  });
  assert.deepEqual(kept.watch, started.watch);
  assert.equal(kept.stop, false);
});

test("each choice reads the page again, at most a few times per page", () => {
  let watch: SelectionWatch | null = { page, rereads: 0, dirty: false };
  let rereads = 0;
  for (let i = 0; i < MAX_SELECTION_REREADS + 3; i++) {
    const next = nextWatch(watch, {
      type: "selection",
      current: page,
      visiting: false,
    });
    watch = next.watch;
    if (next.reread) rereads++;
  }
  assert.equal(rereads, MAX_SELECTION_REREADS);
});

test("a choice made during a read is read once the result arrives", () => {
  const watch = { page, rereads: 1, dirty: false };
  const during = nextWatch(watch, {
    type: "selection",
    current: page,
    visiting: true,
  });
  assert.equal(during.reread, false);
  assert.equal(during.watch?.dirty, true);
  const after = nextWatch(during.watch, {
    type: "result",
    page,
    kind: "needs_selection",
  });
  assert.equal(after.reread, true);
  assert.equal(after.start, false);
  assert.deepEqual(after.watch, { page, rereads: 2, dirty: false });
});

test("choices on a page the shopper has left are ignored", () => {
  const watch = { page, rereads: 0, dirty: false };
  const next = nextWatch(watch, {
    type: "selection",
    current: "https://m.shein.com/ca/other-p-2.html",
    visiting: false,
  });
  assert.equal(next.reread, false);
  assert.deepEqual(next.watch, watch);
});

// A minimal page: listeners, a mutation observer and the WebView bridge, on fake timers.
function fakePage() {
  const listeners = new Map<string, Set<() => void>>();
  const observers: (() => void)[] = [];
  const messages: string[] = [];
  const window: Record<string, unknown> = {
    ReactNativeWebView: { postMessage: (data: string) => messages.push(data) },
  };
  const document = {
    documentElement: {},
    addEventListener: (type: string, listener: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: () => void) =>
      listeners.get(type)?.delete(listener),
  };
  class MutationObserver {
    constructor(private readonly callback: () => void) {}
    observe() {
      observers.push(this.callback);
    }
    disconnect() {
      const index = observers.indexOf(this.callback);
      if (index >= 0) observers.splice(index, 1);
    }
  }
  const run = (script: string) =>
    new Function("window", "document", "MutationObserver", script)(
      window,
      document,
      MutationObserver,
    );
  return {
    run,
    messages,
    fire: (type: string) => listeners.get(type)?.forEach((l) => l()),
    mutate: () => observers.forEach((callback) => callback()),
    listening: () => [...listeners.values()].some((set) => set.size > 0),
  };
}

test("the watch reports a choice once the page settles, and nothing about the page", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const dom = fakePage();
    dom.run(selectionWatchScript());
    dom.run(selectionWatchScript()); // installed once
    dom.mutate();
    mock.timers.tick(5000);
    assert.equal(dom.messages.length, 0, "page changes alone are not a choice");
    dom.fire("click");
    dom.mutate();
    mock.timers.tick(900);
    dom.mutate();
    mock.timers.tick(900);
    assert.equal(dom.messages.length, 0, "still changing");
    mock.timers.tick(200);
    assert.deepEqual(
      dom.messages.map((m) => JSON.parse(m)),
      [{ type: SELECTION_MESSAGE }],
    );
    // A page that never settles is still reported within a few seconds.
    dom.fire("change");
    for (let i = 0; i < 10; i++) {
      dom.mutate();
      mock.timers.tick(500);
    }
    assert.equal(dom.messages.length, 2);
    dom.run(stopSelectionWatchScript());
    assert.equal(dom.listening(), false);
    dom.fire("click");
    mock.timers.tick(5000);
    assert.equal(dom.messages.length, 2);
  } finally {
    mock.timers.reset();
  }
});

test("the server's visit status maps onto what the strip shows", () => {
  const none = () => null;
  assert.deepEqual(
    visitResult({ status: "needs_selection", productProbability: 0.9 }, none),
    { kind: "needs_selection" },
  );
  assert.deepEqual(visitResult({ status: "unconfirmed" }, none), {
    kind: "unconfirmed",
  });
  assert.deepEqual(visitResult({ status: "not_product" }, none), {
    kind: "none",
  });
  assert.equal(visitResult({ status: "pending" }, none), null);
  const product = { url: "https://shop.example/p" } as never;
  assert.deepEqual(
    visitResult({ status: "product", productProbability: 0.9 }, () => product),
    { kind: "product", product, productProbability: 0.9 },
  );
  assert.deepEqual(
    visitResult({ status: "product" }, () => product),
    {
      kind: "none",
    },
  );
});

test("a page the server already knows becomes the strip's product without an upload", async () => {
  const { knownResult } = await import("../src/merchants/visit-result");
  const product = { url: "https://shop.example/p" } as never;
  assert.deepEqual(
    knownResult({ status: "product", product: {}, history: [] }, () => product),
    { kind: "product", product, productProbability: 1 },
  );
  assert.equal(
    knownResult({ status: "unknown" }, () => product),
    null,
  );
  assert.equal(
    knownResult({ status: "product" }, () => null),
    null,
  );
});
