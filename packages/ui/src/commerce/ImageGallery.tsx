import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react-native";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";

import { Pressable } from "../primitives/Pressable";
import { colors, fonts, radius, space } from "../theme/index";

/**
 * A product's images, one per page, swiped sideways; dots under them show where you are and jump to an image, and
 * a counter says which of how many. One image shows alone; none shows nothing.
 */
export function ImageGallery({
  images,
  height,
  label,
}: {
  images: readonly string[];
  height: number;
  label: string;
}) {
  const scroll = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const last = images.length - 1;
  const current = Math.min(page, Math.max(0, last));
  // Stays on the current picture when the width changes (a rotated screen).
  useEffect(() => {
    if (width)
      scroll.current?.scrollTo({ x: current * width, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  // No image, like a broken one, keeps the gallery's place with a placeholder.
  if (!images.length)
    return (
      <View style={styles.frame} accessibilityLabel={`${label}, no image`}>
        <Placeholder width={width} height={height} />
      </View>
    );
  const go = (target: number) => {
    setPage(target);
    scroll.current?.scrollTo({ x: target * width, animated: true });
  };
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessibilityLabel={`${label}, image ${current + 1} of ${images.length}`}
    >
      <View style={styles.frame}>
        <ScrollView
          ref={scroll}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={images.length > 1}
          scrollEventThrottle={32}
          style={{ height }}
          onMomentumScrollEnd={(event) => {
            if (width)
              setPage(Math.round(event.nativeEvent.contentOffset.x / width));
          }}
        >
          {images.map((uri) =>
            failed.has(uri) ? (
              <Placeholder key={uri} width={width} height={height} />
            ) : (
              <Image
                key={uri}
                source={{ uri }}
                resizeMode="contain"
                style={{ width, height }}
                onError={() =>
                  setFailed((previous) => new Set(previous).add(uri))
                }
              />
            ),
          )}
        </ScrollView>
        {images.length > 1 ? (
          <View style={styles.counter} pointerEvents="none">
            <Text style={styles.counterText}>
              {current + 1} / {images.length}
            </Text>
          </View>
        ) : null}
      </View>
      {images.length > 1 ? (
        <View style={styles.dots}>
          {images.map((uri, index) => (
            <Pressable
              key={uri}
              accessibilityRole="button"
              accessibilityLabel={`Image ${index + 1} of ${images.length}`}
              accessibilityState={{ selected: index === current }}
              pressedScale={0.9}
              hitSlop={8}
              onPress={() => go(index)}
              style={[styles.dot, index === current && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Placeholder({ width, height }: { width: number; height: number }) {
  return (
    <View style={[styles.placeholder, { width: width || "100%", height }]}>
      <ImageOff size={32} color={colors.faint} />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  frame: {
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: space.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.chipLine,
  },
  dotActive: { width: 20, backgroundColor: colors.accentInk },
  counter: {
    position: "absolute",
    right: space.sm,
    bottom: space.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: "rgba(34, 30, 27, 0.55)",
  },
  counterText: { fontFamily: fonts.bold, fontSize: 12, color: colors.onAccent },
});
