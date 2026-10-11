import type {
  MoryProps,
  MoryPose,
  MoryHandMotion,
  MoryExpression,
  MoryHeadpiece,
  MoryHolding,
} from "./types";

/** A pose is a preset. Explicit parts and motion override it without changing other choices. */
export const MORY_POSES: Record<
  MoryPose,
  { holding: MoryHolding; loopMs: number; restAt: number }
> = {
  mascot: { holding: "card", loopMs: 3200, restAt: 0.2 },
  scan: { holding: "camera", loopMs: 3000, restAt: 0.6 },
  peek: { holding: "edge", loopMs: 3600, restAt: 0.3 },
  edge: { holding: "edge", loopMs: 3600, restAt: 0.3 },
  deals: { holding: "deals", loopMs: 2800, restAt: 0.5 },
  wave: { holding: "wave", loopMs: 3200, restAt: 0.2 },
  love: { holding: "heart", loopMs: 3000, restAt: 0.45 },
  tag: { holding: "tag", loopMs: 2400, restAt: 0.3 },
  welcome: { holding: "sign", loopMs: 3200, restAt: 0.2 },
  type: { holding: "keyboard", loopMs: 3600, restAt: 0.2 },
  empty: { holding: "box", loopMs: 3400, restAt: 0.3 },
  offline: { holding: "plug", loopMs: 3000, restAt: 0.4 },
};
export type MoryConfiguration = {
  pose: MoryPose;
  holding: MoryHolding;
  headpiece: MoryHeadpiece;
  expression: MoryExpression;
  hands: MoryHandMotion;
  bob: boolean;
  blink: boolean;
  headSway: boolean;
  propMotion: boolean;
  durationMs: number;
  restAt: number;
};
/** The parts the shopper chooses for every Mory (Account → Customize Mory). */
export type MoryLook = { headpiece: MoryHeadpiece; expression: MoryExpression };
export const DEFAULT_MORY_LOOK: MoryLook = {
  headpiece: "orange",
  expression: "neutral",
};
/** `look` is the default for parts a scene leaves unset; a scene's explicit choice wins. */
export function resolveMory(
  props: MoryProps,
  look: MoryLook = DEFAULT_MORY_LOOK,
): MoryConfiguration {
  const pose = props.pose ?? "mascot";
  const preset = MORY_POSES[pose];
  const holding = props.holding ?? preset.holding;
  return {
    pose,
    holding,
    headpiece: props.headpiece ?? look.headpiece,
    expression: props.expression ?? look.expression,
    hands:
      props.motion?.hands ??
      (holding === "wave" ? "wave" : holding === "keyboard" ? "tap" : "hold"),
    bob: props.motion?.body !== "still",
    blink: props.motion?.eyes !== "still",
    headSway: props.motion?.headpiece !== "still",
    propMotion: props.motion?.prop !== "still",
    durationMs: Math.max(400, props.motion?.durationMs ?? preset.loopMs),
    restAt: preset.restAt,
  };
}
