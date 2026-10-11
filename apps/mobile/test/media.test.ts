import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mediaGuardScript,
  pauseMediaScript,
} from "../src/merchants/filtering/media";

/** A minimal page: media elements, capture listeners and a node tree for `contains`/`closest`. */
function page() {
  const listeners: Record<string, ((event: { target: unknown }) => void)[]> =
    {};
  class Node {
    children: Node[] = [];
    constructor(
      public tag: string,
      public className = "",
      public parent?: Node,
    ) {
      parent?.children.push(this);
    }
    contains(other: Node | undefined): boolean {
      for (let node = other; node; node = node.parent)
        if (node === this) return true;
      return false;
    }
    closest(selector: string): Node | null {
      for (let node: Node | undefined = this; node; node = node.parent)
        if (
          /^(video|audio)$/.test(node.tag) ||
          /video|player/i.test(node.className)
        )
          return node;
      return selector ? null : null;
    }
  }
  class HTMLMediaElement extends Node {
    paused = true;
    play() {
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
  }
  const body = new Node("body");
  const media: HTMLMediaElement[] = [];
  const document = {
    addEventListener: (
      type: string,
      listener: (event: { target: unknown }) => void,
    ) => (listeners[type] ??= []).push(listener),
    querySelectorAll: () => media,
  };
  const window: Record<string, unknown> = {};
  const run = (script: string) =>
    new Function(
      "window",
      "document",
      "HTMLMediaElement",
      "DOMException",
      script,
    )(window, document, HTMLMediaElement, class extends Error {});
  const fire = (type: string, target: unknown) =>
    listeners[type]?.forEach((listener) => listener({ target }));
  const add = (parent: Node, tag = "video") => {
    const element = new HTMLMediaElement(tag, "", parent);
    media.push(element);
    return element;
  };
  return { run, fire, add, body, Node };
}

test("store media never starts on its own; a tap on the player allows it", async () => {
  const p = page();
  p.run(mediaGuardScript);
  const player = new p.Node("div", "product-video-player", p.body);
  const video = p.add(player);
  // Autoplay attribute: the element starts and the guard pauses it.
  video.paused = false;
  p.fire("play", video);
  assert.equal(video.paused, true);
  // Script-started playback is refused before any tap on the player.
  await assert.rejects(video.play());
  assert.equal(video.paused, true);
  // A tap elsewhere on the page does not count.
  p.fire("click", new p.Node("button", "add-to-cart", p.body));
  await assert.rejects(video.play());
  // A tap on the player's own button does.
  p.fire("click", new p.Node("button", "play", player));
  await video.play();
  assert.equal(video.paused, false);
});

test("hiding the store pauses everything playing in it", () => {
  const p = page();
  const audio = p.add(p.body, "audio");
  audio.paused = false;
  p.run(pauseMediaScript);
  assert.equal(audio.paused, true);
});
