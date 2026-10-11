import { useMemo, useState } from "react";
import {
  type LayoutChangeEvent,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";

import { scatter } from "../lib/scatter";
import { MorySilhouette, SILHOUETTE_FACES } from "../mory/MorySilhouette";

/** Items per 100,000 px² at density 1 (about 24 on a 1440 × 900 window). */
const PER_AREA = 2;
const DEFAULT_SIZES: [number, number] = [40, 96];

type Props = {
  /** 0 hides the field; 1 is the default spread; 2 doubles it. */
  density?: number;
  /** Different seeds give different, but stable, layouts. */
  seed?: string;
  /** Smallest and largest Mory, in px. */
  sizes?: [number, number];
  style?: StyleProp<ViewStyle>;
};

/**
 * A background of faint grey Mory silhouettes, scattered evenly and deterministically over the area it
 * fills (turned a little, in three faces). It sits behind content and never takes touches. Consumers can
 * increase density when a wide, open surface needs Mory to read as a pattern rather than a single accent.
 */
export function MoryField({
  density = 1,
  seed = "morycart",
  sizes = DEFAULT_SIZES,
  style,
}: Props) {
  const [area, setArea] = useState({ width: 0, height: 0 });
  const items = useMemo(
    () =>
      scatter({
        ...area,
        count: Math.round(
          ((area.width * area.height) / 100_000) *
            PER_AREA *
            Math.max(0, density),
        ),
        seed,
        minSize: sizes[0],
        maxSize: sizes[1],
        maxRotation: 18,
        jitter: 0.7,
        variants: SILHOUETTE_FACES,
      }),
    [area, density, seed, sizes],
  );
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.field, style]}
      onLayout={(event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        setArea((current) =>
          current.width === width && current.height === height
            ? current
            : { width, height },
        );
      }}
    >
      {items.map((item, index) => (
        <View
          key={index}
          style={{
            position: "absolute",
            left: item.x - item.size / 2,
            top: item.y - item.size / 2,
            transform: [{ rotate: `${item.rotation}deg` }],
          }}
        >
          <MorySilhouette size={item.size} face={item.variant} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ field: { overflow: "hidden" } });
