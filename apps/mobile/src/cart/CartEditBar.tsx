import { StyleSheet, View } from "react-native";
import { ListPlus, Trash2 } from "lucide-react-native";
import { Button, colors } from "@morydeals/ui";

/** While editing the cart: the selection's actions, floating where the tab bar sits. */
export function CartEditBar({
  count,
  bottomInset,
  onAddToList,
  onRemove,
}: {
  count: number;
  bottomInset: number;
  onAddToList: () => void;
  onRemove: () => void;
}) {
  const none = count === 0;
  return (
    <View
      pointerEvents="box-none"
      style={[s.anchor, { bottom: Math.max(bottomInset, 12) }]}
    >
      <View style={s.bar}>
        <Button
          secondary
          disabled={none}
          icon={<ListPlus size={16} color={none ? colors.faint : colors.ink} />}
          style={s.button}
          onPress={onAddToList}
        >
          {none ? "Add to list" : `Add to list (${count})`}
        </Button>
        <Button
          danger
          disabled={none}
          icon={<Trash2 size={16} color={colors.onAccent} />}
          style={s.button}
          onPress={onRemove}
        >
          {none ? "Remove" : `Remove (${count})`}
        </Button>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  anchor: { position: "absolute", left: 16, right: 16, alignItems: "center" },
  bar: {
    width: "100%",
    maxWidth: 420,
    flexDirection: "row",
    gap: 8,
    padding: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    boxShadow: "0 12px 30px rgba(34,30,27,0.16)",
  },
  button: { flex: 1 },
});
