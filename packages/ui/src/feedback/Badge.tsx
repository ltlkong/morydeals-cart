import type { ReactNode } from "react";
import { View, StyleSheet } from "react-native";
import { Copy } from "../content/Copy";
import { colors } from "../theme/index";

export function Badge({
  children,
  green,
  icon,
}: {
  children: string;
  green?: boolean;
  icon?: ReactNode;
}) {
  return (
    <View style={[s.badge, green && { backgroundColor: colors.successSoft }]}>
      {icon}
      <Copy
        weight="extra"
        style={{
          fontSize: 11,
          lineHeight: 16,
          color: green ? colors.success : colors.accentInk,
        }}
      >
        {children}
      </Copy>
    </View>
  );
}
const s = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
  },
});
