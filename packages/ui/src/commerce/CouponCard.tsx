import { View, StyleSheet } from "react-native";
import { Ticket, Copy as CopyIcon, Check } from "lucide-react-native";
import { Copy } from "../content/Copy";
import { Button } from "../actions/Button";
import { colors } from "../theme/index";
import { PhaseFade } from "../motion/PhaseFade";

export type CouponCardProps = {
  title: string;
  code: string;
  merchantLabel: string;
  terms: string;
  statusLabel?: string;
  copyState?: "idle" | "copying" | "copied" | "error";
  /** Clipboard ownership stays with the consuming app. */
  onCopy: (code: string) => void;
};
export function CouponCard({
  title,
  code,
  merchantLabel,
  terms,
  statusLabel,
  copyState = "idle",
  onCopy,
}: CouponCardProps) {
  const copied = copyState === "copied";
  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.icon}>
          <Ticket size={23} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Copy tone="muted" style={{ fontSize: 12 }}>
            {merchantLabel}
          </Copy>
          <Copy weight="extra" style={{ fontSize: 17 }}>
            {title}
          </Copy>
        </View>
      </View>
      <Copy tone="muted" style={{ fontSize: 12, lineHeight: 18 }}>
        {terms}
      </Copy>
      <View style={s.code}>
        <Copy
          selectable
          weight="extra"
          style={{ fontSize: 19, letterSpacing: 1.5, flexShrink: 1 }}
        >
          {code}
        </Copy>
        <PhaseFade version={copyState}>
          <Button
            secondary
            loading={copyState === "copying"}
            style={{ minHeight: 40, paddingVertical: 5, paddingHorizontal: 10 }}
            icon={
              copied ? (
                <Check size={15} color={colors.success} />
              ) : (
                <CopyIcon size={15} color={colors.ink} />
              )
            }
            onPress={() => onCopy(code)}
          >
            {copied
              ? "Copied"
              : copyState === "copying"
                ? "Copying…"
                : "Copy code"}
          </Button>
        </PhaseFade>
      </View>
      {!!statusLabel && (
        <Copy
          tone={copyState === "error" ? "accentInk" : "faint"}
          accessibilityLiveRegion="polite"
          style={{ fontSize: 11 }}
        >
          {statusLabel}
        </Copy>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    padding: 17,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  header: { flexDirection: "row", gap: 10, alignItems: "center" },
  icon: {
    width: 43,
    height: 43,
    backgroundColor: colors.accentSoft,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  code: {
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.lineStrong,
    paddingTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
});
