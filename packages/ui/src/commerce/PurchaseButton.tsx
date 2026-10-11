import Check from "lucide-react-native/icons/check";
import Copy from "lucide-react-native/icons/copy";
import ExternalLink from "lucide-react-native/icons/external-link";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { PhaseFade } from "../motion/PhaseFade";
import { Pressable } from "../primitives/Pressable";
import { colors, radius, space } from "../theme/tokens";
import { font, type } from "../theme/typography";

export type PurchaseButtonProps = {
  couponCode?: string;
  price?: string;
  buyLabel: string;
  /** A short visible label in a crowded native action bar; the full merchant label stays accessible. */
  compactBuyLabel?: string;
  copyLabel: string;
  copiedLabel: string;
  copyErrorLabel: string;
  onCopy: (code: string) => Promise<void>;
  onBuy: () => void;
  loading?: boolean;
  disabled?: boolean;
};

/** One coupon-to-purchase interaction on web and native; clipboard and navigation stay with the host. */
export function PurchaseButton(props: PurchaseButtonProps) {
  return <PurchaseControl key={props.couponCode ?? ""} {...props} />;
}

function PurchaseControl({
  couponCode,
  price,
  buyLabel,
  compactBuyLabel,
  copyLabel,
  copiedLabel,
  copyErrorLabel,
  onCopy,
  onBuy,
  loading = false,
  disabled = false,
}: PurchaseButtonProps) {
  const [phase, setPhase] = useState<"coupon" | "copied" | "buy">(
    couponCode ? "coupon" : "buy",
  );
  const [copying, setCopying] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef(true);
  const request = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (phase !== "copied") return;
    const timer = setTimeout(() => setPhase("buy"), 350);
    return () => clearTimeout(timer);
  }, [phase]);
  const copy = async () => {
    if (!couponCode || request.current) return;
    request.current = true;
    setCopying(true);
    setFailed(false);
    try {
      await onCopy(couponCode);
      if (active.current) setPhase("copied");
    } catch {
      if (active.current) {
        setFailed(true);
        setPhase("buy");
      }
    } finally {
      request.current = false;
      if (active.current) setCopying(false);
    }
  };
  const buying = phase === "buy";
  const busy = buying ? loading : copying;
  const label = buying
    ? buyLabel
    : phase === "copied"
      ? copiedLabel
      : copyLabel;
  const ink = buying ? colors.onAccent : colors.accentInk;
  const Icon = buying ? ExternalLink : phase === "copied" ? Check : Copy;
  return (
    <View style={styles.wrap}>
      <PhaseFade version={phase}>
        <Pressable
          accessibilityRole={buying ? "link" : "button"}
          accessibilityLabel={`${label}${buying && price ? `, ${price}` : ""}`}
          accessibilityState={{
            busy,
            disabled: disabled || busy || phase === "copied",
          }}
          disabled={disabled || busy || phase === "copied"}
          onPress={buying ? onBuy : () => void copy()}
          style={({ hovered }) => [
            styles.button,
            buying ? styles.buy : styles.coupon,
            buying && hovered && styles.buyHover,
            disabled && { opacity: 0.45 },
          ]}
        >
          {buying && compactBuyLabel ? (
            <View style={styles.compactCopy}>
              {price ? (
                <Text
                  style={[styles.price, styles.compactPrice]}
                  numberOfLines={1}
                >
                  {price}
                </Text>
              ) : null}
              <Text
                style={[styles.label, styles.compactLabel, { color: ink }]}
                numberOfLines={1}
              >
                {compactBuyLabel}
              </Text>
            </View>
          ) : (
            <>
              {buying && price ? (
                <>
                  <Text style={styles.price} numberOfLines={1}>
                    {price}
                  </Text>
                  <View style={styles.divider} />
                </>
              ) : null}
              <Text style={[styles.label, { color: ink }]} numberOfLines={1}>
                {label}
              </Text>
            </>
          )}
          {busy ? (
            <ActivityIndicator size="small" color={ink} />
          ) : buying && compactBuyLabel ? null : (
            <Icon size={16} color={ink} strokeWidth={2.4} />
          )}
        </Pressable>
      </PhaseFade>
      {failed ? (
        <View style={{ gap: space.xs }}>
          <Text accessibilityRole="alert" style={[type.caption, styles.error]}>
            {copyErrorLabel}
          </Text>
          <Text selectable style={type.bodyStrong}>
            {couponCode}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  button: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
  },
  buy: {
    backgroundColor: colors.accentInk,
    borderWidth: 1,
    borderColor: colors.accentInk,
  },
  buyHover: { backgroundColor: colors.accentDeep },
  coupon: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.accentInk,
    backgroundColor: colors.accentSoft,
  },
  label: { flexShrink: 1, fontFamily: font.bold, fontSize: 12 },
  price: {
    flexShrink: 0,
    fontFamily: font.extra,
    fontSize: 18,
    color: colors.onAccent,
  },
  compactCopy: { alignItems: "center", minWidth: 0, flexShrink: 1 },
  compactPrice: { fontSize: 16, lineHeight: 20 },
  compactLabel: { fontSize: 12, lineHeight: 16 },
  divider: {
    width: 1.5,
    height: 22,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  error: { color: colors.danger },
});
