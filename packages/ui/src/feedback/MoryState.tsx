import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { Copy } from "../content/Copy";
import { Mory } from "../mory/Mory";
import type { MoryProps } from "../mory/types";

/** The moments a screen hands to Mory instead of a blank page or a bare spinner. */
export type MoryStateKind =
  | "empty-cart"
  | "price-drop"
  | "loading"
  | "no-results"
  | "error"
  | "alert-set";

/**
 * Which Mory plays each moment. A scene sets the expression only where the moment needs one; otherwise
 * the shopper's chosen look shows through.
 */
export const MORY_STATE_SCENES: Record<
  MoryStateKind,
  Pick<MoryProps, "pose" | "expression">
> = {
  "empty-cart": { pose: "empty" },
  "price-drop": { pose: "drop", expression: "starry" },
  loading: { pose: "search" },
  "no-results": { pose: "search", expression: "worried" },
  error: { pose: "offline", expression: "worried" },
  "alert-set": { pose: "alert", expression: "happy" },
};

/**
 * Mory with a title, an optional message and an optional action (a Button the host supplies): empty
 * cart, a price drop, loading, no results, a failure, or an alert just set. `stack` centres it for a
 * whole screen or sheet; `inline` puts a small Mory beside the words for a banner inside a list.
 * Labels and the amount (shown on the price-drop card, e.g. "-18%") are presentation values from the host.
 */
export function MoryState({
  kind,
  title,
  message,
  action,
  amount,
  layout = "stack",
  size,
  still,
}: {
  kind: MoryStateKind;
  title: string;
  message?: string;
  action?: ReactNode;
  amount?: string;
  layout?: "stack" | "inline";
  size?: number;
  still?: boolean;
}) {
  const inline = layout === "inline";
  const loading = kind === "loading";
  return (
    <View
      style={inline ? s.inline : s.stack}
      accessibilityRole={loading ? "progressbar" : undefined}
      accessibilityState={loading ? { busy: true } : undefined}
      accessibilityLiveRegion={
        loading || kind === "price-drop" ? "polite" : undefined
      }
    >
      <Mory
        {...MORY_STATE_SCENES[kind]}
        size={size ?? (inline ? 64 : 150)}
        sign={amount}
        still={still}
        showEffects={!inline}
      />
      <View style={inline ? s.inlineWords : s.words}>
        <Copy
          weight="extra"
          style={[s.title, inline && s.inlineTitle]}
          accessibilityRole="header"
        >
          {title}
        </Copy>
        {message ? (
          <Copy tone="muted" style={[s.message, inline && s.inlineMessage]}>
            {message}
          </Copy>
        ) : null}
      </View>
      {action ? <View style={inline ? null : s.action}>{action}</View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  stack: { alignItems: "center", gap: 6, paddingVertical: 16 },
  words: { alignItems: "center", gap: 4, maxWidth: 300 },
  title: { fontSize: 18, lineHeight: 24, textAlign: "center" },
  message: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  action: { marginTop: 10 },
  inline: { flexDirection: "row", alignItems: "center", gap: 12 },
  inlineWords: { flex: 1, gap: 2 },
  inlineTitle: { fontSize: 15, lineHeight: 20, textAlign: "left" },
  inlineMessage: { fontSize: 13, lineHeight: 18, textAlign: "left" },
});
