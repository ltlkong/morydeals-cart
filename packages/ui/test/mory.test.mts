import { test } from "node:test";
import assert from "node:assert/strict";
import { MORY_POSES, resolveMory } from "../src/mory/poses.ts";
import { strikeAt, keyLightAt } from "../src/mory/motion/hands.ts";
import {
  blinkAt,
  bobAt,
  hopAt,
  ringAngle,
  waveAngle,
} from "../src/mory/motion.ts";

test("old poses keep their held objects while explicit parts compose independently", () => {
  for (const [pose, preset] of Object.entries(MORY_POSES)) {
    const result = resolveMory({
      size: 200,
      pose: pose as keyof typeof MORY_POSES,
    });
    assert.equal(result.holding, preset.holding);
    assert.equal(result.headpiece, "orange");
    assert.equal(result.durationMs, preset.loopMs);
  }
  const custom = resolveMory({
    size: 200,
    pose: "scan",
    holding: "heart",
    headpiece: "pear",
    expression: "wink",
    motion: { hands: "wave", eyes: "still" },
  });
  assert.deepEqual(
    {
      holding: custom.holding,
      headpiece: custom.headpiece,
      hands: custom.hands,
      expression: custom.expression,
      blink: custom.blink,
    },
    {
      holding: "heart",
      headpiece: "pear",
      hands: "wave",
      expression: "wink",
      blink: false,
    },
  );
  assert.equal(custom.bob, true);
});

test("each animation channel can be disabled without changing the character", () => {
  const config = resolveMory({
    size: 200,
    holding: "keyboard",
    motion: {
      body: "still",
      eyes: "still",
      headpiece: "still",
      prop: "still",
      durationMs: 100,
    },
  });
  assert.equal(config.hands, "tap");
  assert.equal(config.bob, false);
  assert.equal(config.blink, false);
  assert.equal(config.headSway, false);
  assert.equal(config.propMotion, false);
  assert.equal(config.durationMs, 400);
});

test("inactive keystrokes stay neutral, and strike transitions remain continuous", () => {
  for (const p of [-1, -0.01, 1, 2]) {
    assert.equal(strikeAt(p), 0);
    assert.equal(keyLightAt(p), 0);
  }
  for (const boundary of [0.35, 0.55])
    assert.ok(
      Math.abs(strikeAt(boundary - 0.000001) - strikeAt(boundary + 0.000001)) <
        0.001,
    );
  assert.equal(strikeAt(0.35), -18);
  assert.ok(Math.abs(strikeAt(0.55) - 5) < 0.00001);
});

test("loop endpoints are stable and blinking does not collapse the eyes completely", () => {
  assert.equal(bobAt(0), bobAt(1));
  assert.equal(waveAngle(1), 0);
  assert.equal(blinkAt(0), 1);
  assert.ok(blinkAt(0.9) >= 0.099 && blinkAt(0.9) <= 0.101);
  for (let i = 0; i <= 100; i++)
    assert.ok(blinkAt(i / 100) > 0 && blinkAt(i / 100) <= 1.000001);
});

test("the shopper's chosen look is every Mory's default; a scene that sets a part keeps it", async () => {
  const { resolveMory } = await import("../src/mory/poses.ts");
  const look = { headpiece: "pear", expression: "wink" } as const;
  const chosen = resolveMory({ size: 64, pose: "wave" }, look);
  assert.equal(chosen.headpiece, "pear");
  assert.equal(chosen.expression, "wink");
  assert.equal(
    resolveMory({ size: 64, expression: "sleepy" }, look).expression,
    "sleepy",
  );
  // Without a chosen look, the original Mory.
  assert.equal(resolveMory({ size: 64 }).headpiece, "orange");
  assert.equal(resolveMory({ size: 64 }).expression, "neutral");
});

test("the new moments keep their own held objects and leave the shopper's look alone", () => {
  const expected = {
    alert: "bell",
    drop: "drop",
    bought: "bag",
    search: "magnifier",
  } as const;
  const look = { headpiece: "cherry", expression: "starry" } as const;
  for (const [pose, holding] of Object.entries(expected)) {
    const config = resolveMory(
      { size: 120, pose: pose as keyof typeof expected },
      look,
    );
    assert.equal(config.holding, holding);
    assert.equal(config.hands, "hold");
    assert.equal(config.headpiece, "cherry");
    assert.equal(config.expression, "starry");
  }
});

test("a surprised look is the shopper's default, and a scene can still ask for it explicitly", () => {
  const look = { headpiece: "lemon", expression: "surprised" } as const;
  assert.equal(
    resolveMory({ size: 120, pose: "drop" }, look).expression,
    "surprised",
  );
  assert.equal(
    resolveMory({ size: 120, pose: "drop", expression: "surprised" })
      .expression,
    "surprised",
  );
  assert.equal(
    resolveMory({ size: 120, expression: "happy" }, look).expression,
    "happy",
  );
});

test("the bell rings and the drop card hops early in the turn, then rest without a jump", () => {
  for (const t of [0, 0.32, 0.5, 0.99, 1]) assert.equal(ringAngle(t), 0);
  assert.ok(Math.abs(ringAngle(0.3199999)) < 0.01);
  assert.ok(
    Math.max(...[0.02, 0.06, 0.1].map((t) => Math.abs(ringAngle(t)))) > 5,
  );
  for (const t of [0, 0.4, 0.7, 1]) assert.ok(Math.abs(hopAt(t)) < 1e-9);
  assert.ok(Math.abs(hopAt(0.1) - 1) < 1e-9);
  for (let i = 0; i <= 100; i++) {
    assert.ok(hopAt(i / 100) >= 0 && hopAt(i / 100) <= 1);
    assert.ok(Math.abs(ringAngle(i / 100)) <= 14);
  }
});
