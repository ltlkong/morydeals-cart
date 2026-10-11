import { StyleSheet, View } from "react-native";
import Animated, { type SharedValue } from "react-native-reanimated";
import { BrandSparkles } from "../content/BrandSparkles";
import { Flash, RisingHeart, Sparkle } from "./effects";
import { EDGE_LINE } from "./held";
import { MoryFigure } from "./MoryFigure";
import { resolveMory, type MoryConfiguration } from "./poses";
import { useMoryLook } from "./look";
import type { MoryProps } from "./types";
import { useClock } from "./useClock";
import { ENTRANCE_MS, useDropIn } from "./useDropIn";
export type { MoryPose, MoryProps } from "./types";

export const LIVE_FROM = 64;
const FIGURE = 0.84;
export const moryEdgeAt = (size: number) =>
  size * (1 - FIGURE + (FIGURE * EDGE_LINE) / 200);

function PoseEffects({
  config,
  clock,
  size,
}: {
  config: MoryConfiguration;
  clock: SharedValue<number>;
  size: number;
}) {
  if (config.holding === "camera")
    return (
      <>
        <Flash
          clock={clock}
          at={{ x: 0.5, y: 1 - FIGURE + FIGURE * 0.76 }}
          size={size * 0.14}
        />
        <Sparkle
          clock={clock}
          at={{ x: 0.06, y: 0.5 }}
          size={size * 0.108}
          phase={0.2}
        />
      </>
    );
  if (config.holding === "deals")
    return (
      <Sparkle clock={clock} at={{ x: 0.78, y: 0.16 }} size={size * 0.18} />
    );
  if (config.holding === "heart")
    return (
      <>
        <RisingHeart
          clock={clock}
          at={{ x: 0.22, y: 0.3 }}
          size={size * 0.135}
        />
        <RisingHeart
          clock={clock}
          at={{ x: 0.68, y: 0.24 }}
          size={size * 0.117}
          phase={0.33}
        />
        <RisingHeart
          clock={clock}
          at={{ x: 0.46, y: 0.1 }}
          size={size * 0.099}
          phase={0.66}
        />
      </>
    );
  if (["mascot", "wave", "welcome"].includes(config.pose))
    return (
      <View
        pointerEvents="none"
        style={{ position: "absolute", left: size * 0.76, top: size * 0.1 }}
      >
        <BrandSparkles size={size * 0.22} />
      </View>
    );
  return null;
}

type BoxProps = {
  props: MoryProps;
  config: MoryConfiguration;
  clock: SharedValue<number> | null;
};
function MoryBox({ props, config, clock }: BoxProps) {
  const { size, sign, keystrokes, showEffects = true, dropIn = false } = props;
  const figure = size * FIGURE;
  const entrance = useDropIn(dropIn && clock !== null, figure);
  return (
    <View
      style={{ width: size, height: size }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {entrance ? (
        <>
          <Animated.View
            style={[
              styles.ground,
              { width: figure * 0.52, marginLeft: -figure * 0.26 },
              entrance.shadowStyle,
            ]}
          />
          <Animated.View
            style={[styles.dust, styles.dustRight, entrance.dustStyle]}
          />
          <View style={styles.mirror}>
            <Animated.View
              style={[styles.dust, styles.dustRight, entrance.dustStyle]}
            />
          </View>
        </>
      ) : null}
      <Animated.View
        style={[
          styles.figure,
          { width: figure, height: figure, marginLeft: -figure / 2 },
          entrance?.bodyStyle,
        ]}
      >
        <MoryFigure
          size={figure}
          holding={config.holding}
          headpiece={config.headpiece}
          expression={config.expression}
          handMotion={config.hands}
          bodyMotion={config.bob}
          blink={config.blink}
          headSway={config.headSway}
          propMotion={config.propMotion}
          clock={clock}
          orangeLift={entrance?.orangeLift}
          shadow={!entrance}
          words={sign}
          keystrokes={keystrokes}
        />
      </Animated.View>
      {clock && showEffects ? (
        <PoseEffects config={config} clock={clock} size={size} />
      ) : null}
    </View>
  );
}
function LiveMory({
  props,
  config,
}: {
  props: MoryProps;
  config: MoryConfiguration;
}) {
  const clock = useClock(
    config.durationMs,
    config.restAt,
    props.dropIn ? ENTRANCE_MS : 0,
  );
  return <MoryBox props={props} config={config} clock={clock} />;
}
/** Pose presets preserve the original Mory. Explicit parts and animation channels compose independently. */
export function Mory(props: MoryProps) {
  const config = resolveMory(props, useMoryLook());
  // A still render wins over a caller clock; small figures are still unless live is explicit.
  if (props.still || (props.size < LIVE_FROM && !props.live && !props.clock))
    return <MoryBox props={props} config={config} clock={null} />;
  if (props.clock)
    return <MoryBox props={props} config={config} clock={props.clock} />;
  return <LiveMory props={props} config={config} />;
}
const styles = StyleSheet.create({
  figure: {
    position: "absolute",
    left: "50%",
    bottom: 0,
    transformOrigin: "50% 92%",
  },
  ground: {
    position: "absolute",
    left: "50%",
    bottom: "1%",
    height: "5%",
    borderRadius: 999,
    backgroundColor: "rgba(34,30,27,0.10)",
  },
  mirror: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    transform: [{ scaleX: -1 }],
  },
  dust: {
    position: "absolute",
    bottom: "3%",
    width: "9%",
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: "#E9DFD6",
  },
  dustRight: { left: "62%" },
});
