import { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
} from "react-native-reanimated";

/**
 * Small round logos taking turns in one spot, each fading into the next. Decorative: the host's control keeps its own
 * label. With one logo it simply shows it.
 */
export function LogoCarousel({
  uris,
  size = 22,
  intervalMs = 2500,
}: {
  uris: readonly string[];
  size?: number;
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    for (const uri of uris) void Image.prefetch(uri).catch(() => false);
  }, [uris]);
  useEffect(() => {
    if (uris.length < 2) return undefined;
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % uris.length),
      intervalMs,
    );
    return () => clearInterval(timer);
  }, [uris.length, intervalMs]);
  const uri = uris[index % Math.max(1, uris.length)];
  if (!uri) return null;
  const round = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, round]}
    >
      {/* A new key per logo lets the old one fade out while the next fades in. */}
      <Animated.View
        key={uri}
        entering={FadeIn.duration(300).reduceMotion(ReduceMotion.System)}
        exiting={FadeOut.duration(300).reduceMotion(ReduceMotion.System)}
        style={StyleSheet.absoluteFill}
      >
        <Image source={{ uri }} resizeMode="contain" style={round} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({ frame: { overflow: "hidden" } });
