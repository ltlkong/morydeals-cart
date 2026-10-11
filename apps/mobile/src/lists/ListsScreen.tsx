import { memo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Plus } from "lucide-react-native";
import {
  Button,
  Copy,
  ListCover,
  Mory,
  Pressable,
  colors,
} from "@morydeals/ui";
import type { ListSummary } from "./lists-api";
import { createList } from "./lists-api";
import { ListNameSheet } from "./ListNameSheet";

/** The Lists page: each list as a card with its cover mosaic, name and size, and a way to start a new one. */
export const ListsScreen = memo(function ListsScreen({
  lists,
  ready,
  error,
  onOpen,
  onChanged,
}: {
  lists: ListSummary[];
  ready: boolean;
  error: string;
  onOpen: (list: ListSummary) => void;
  /** Reloads the overview after a change. */
  onChanged: () => Promise<void>;
}) {
  const [naming, setNaming] = useState(false);
  return (
    <View style={s.root}>
      <View style={s.top}>
        <View style={s.heading}>
          <Copy weight="extra" style={s.title}>
            Your lists
          </Copy>
          <Copy tone="muted" style={s.small}>
            Keep your finds together, your way.
          </Copy>
        </View>
        <Button
          icon={<Plus size={16} color={colors.onAccent} />}
          onPress={() => setNaming(true)}
        >
          New list
        </Button>
      </View>
      {error ? (
        <Copy accessibilityRole="alert" style={s.small}>
          {error}
        </Copy>
      ) : null}
      {ready && !lists.length && !error ? (
        <View style={s.empty}>
          <Mory pose="love" size={120} />
          <Copy weight="extra">No lists yet</Copy>
          <Copy tone="muted" style={s.note}>
            Make a list for a room, a trip or a gift, then save products to it
            from any product page.
          </Copy>
        </View>
      ) : null}
      {lists.map((list) => (
        <Pressable
          key={list.id}
          accessibilityRole="button"
          accessibilityLabel={`${list.name}, ${list.itemCount} products`}
          onPress={() => onOpen(list)}
          style={s.card}
        >
          <ListCover images={list.covers} size={72} />
          <View style={s.text}>
            <Copy weight="extra" numberOfLines={1} style={s.name}>
              {list.name}
            </Copy>
            <Copy tone="muted" style={s.small}>
              {list.itemCount === 1
                ? "1 product"
                : `${list.itemCount} products`}
            </Copy>
          </View>
        </Pressable>
      ))}
      <ListNameSheet
        visible={naming}
        title="New list"
        confirm="Create list"
        onClose={() => setNaming(false)}
        onSubmit={async (name) => {
          await createList(name);
          await onChanged();
        }}
      />
    </View>
  );
});
const s = StyleSheet.create({
  root: { gap: 12, width: "100%", paddingTop: 16 },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  heading: { flex: 1, gap: 2 },
  title: { fontSize: 28, lineHeight: 36 },
  small: { fontSize: 13, lineHeight: 18 },
  empty: { alignItems: "center", gap: 12, paddingVertical: 36 },
  note: { textAlign: "center", maxWidth: 300 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 17, lineHeight: 23 },
});
