import type { ReactNode } from "react";
import { View } from "react-native";
import { masonryColumns } from "./masonry-layout";
export type MasonryProps<T> = {
  items: readonly T[];
  width: number;
  columns: number;
  gap?: number;
  keyExtractor: (item: T) => string;
  getItemHeight: (item: T, columnWidth: number) => number;
  renderItem: (item: T, columnWidth: number) => ReactNode;
};
/** A shared, non-virtualized UI wall. The host supplies stable cell geometry. */
export function Masonry<T>({
  items,
  width,
  columns: count,
  gap = 8,
  keyExtractor,
  getItemHeight,
  renderItem,
}: MasonryProps<T>) {
  const countSafe = Math.max(1, Math.floor(count));
  const columnWidth = Math.max(0, (width - gap * (countSafe - 1)) / countSafe);
  const columns = masonryColumns(
    items,
    countSafe,
    (item) => getItemHeight(item, columnWidth),
    gap,
  );
  return (
    <View
      style={{ width, flexDirection: "row", gap, alignItems: "flex-start" }}
    >
      {columns.map((items, i) => (
        <View key={i} style={{ width: columnWidth, gap }}>
          {items.map((item) => (
            <View key={keyExtractor(item)}>
              {renderItem(item, columnWidth)}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
