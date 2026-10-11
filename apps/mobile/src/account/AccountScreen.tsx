import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { ChevronRight, History, Smile } from "lucide-react-native";
import type { ReactNode } from "react";
import { Button, Copy, Mory, Pressable, colors } from "@morydeals/ui";

/**
 * The account page: who is using the app (a guest until sign-in arrives) and a menu of what is kept for them.
 * Only working items are listed.
 */
export const AccountScreen = memo(function AccountScreen({
  historyCount,
  onOpenHistory,
  onCustomizeMory,
}: {
  historyCount: number;
  onOpenHistory: () => void;
  onCustomizeMory: () => void;
}) {
  return (
    <View style={s.root}>
      <View style={s.profile}>
        <Mory pose="wave" size={72} />
        <View style={s.who}>
          <Copy weight="extra" style={s.name}>
            Guest
          </Copy>
          <Copy tone="muted" style={s.small}>
            Your cart and history are saved on this device.
          </Copy>
        </View>
      </View>
      <Button
        secondary
        disabled
        label="Sign in, coming soon"
        onPress={() => undefined}
      >
        Sign in · coming soon
      </Button>
      <View style={s.menu}>
        <MenuRow
          icon={<History size={18} color={colors.accentInk} />}
          label="Browsing history"
          detail={historyCount ? String(historyCount) : undefined}
          accessibilityLabel={`Browsing history, ${historyCount} products`}
          onPress={onOpenHistory}
        />
        <View style={s.divider} />
        <MenuRow
          icon={<Smile size={18} color={colors.accentInk} />}
          label="Customize Mory"
          onPress={onCustomizeMory}
        />
      </View>
    </View>
  );
});
function MenuRow({
  icon,
  label,
  detail,
  accessibilityLabel,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={s.row}
    >
      <View style={s.icon}>{icon}</View>
      <Copy weight="bold" style={s.rowLabel}>
        {label}
      </Copy>
      {detail ? (
        <Copy tone="muted" style={s.small}>
          {detail}
        </Copy>
      ) : null}
      <ChevronRight size={18} color={colors.faint} />
    </Pressable>
  );
}
const s = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 60,
    backgroundColor: colors.line,
  },
  root: { gap: 16, paddingTop: 16 },
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  who: { flex: 1, gap: 2 },
  name: { fontSize: 20, lineHeight: 26 },
  small: { fontSize: 13, lineHeight: 18 },
  menu: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSoft,
  },
  rowLabel: { flex: 1, fontSize: 15, lineHeight: 21 },
});
