import type { TextStyle } from "react-native";

import { colors, fontSize } from "./tokens";

/** PostScript names; expo-font embeds the files at build time (app.json). */
export const font = {
  regular: "Nunito-Regular",
  semibold: "Nunito-SemiBold",
  bold: "Nunito-Bold",
  extra: "Nunito-ExtraBold",
} as const;

export const type = {
  /** A screen's own title. */
  pageTitle: {
    fontFamily: font.extra,
    fontSize: fontSize.pageTitle,
    lineHeight: 34,
    color: colors.ink,
  },
  display: {
    fontFamily: font.extra,
    fontSize: fontSize.display,
    lineHeight: 38,
    color: colors.ink,
  },
  /** Large price or deal callout; keeps the amount's own currency formatting. */
  priceDisplay: {
    fontFamily: font.extra,
    fontSize: fontSize.priceDisplay,
    color: colors.accentInk,
  },
  title: {
    fontFamily: font.extra,
    fontSize: fontSize.title,
    lineHeight: 30,
    color: colors.ink,
  },
  heading: {
    fontFamily: font.extra,
    fontSize: fontSize.heading,
    lineHeight: 24,
    color: colors.ink,
  },
  body: {
    fontFamily: font.regular,
    fontSize: fontSize.body,
    lineHeight: 21,
    color: colors.ink,
  },
  bodyStrong: {
    fontFamily: font.bold,
    fontSize: fontSize.body,
    lineHeight: 21,
    color: colors.ink,
  },
  caption: {
    fontFamily: font.semibold,
    fontSize: fontSize.caption,
    lineHeight: 18,
    color: colors.muted,
  },
  /** The small uppercase label above a section ("Recent", "Shop by need"). */
  eyebrow: {
    fontFamily: font.extra,
    fontSize: fontSize.eyebrow,
    lineHeight: 16,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.muted,
  },
  label: {
    fontFamily: font.bold,
    fontSize: fontSize.label,
    lineHeight: 14,
    color: colors.muted,
  },
  tab: {
    fontFamily: font.bold,
    fontSize: fontSize.tab,
    lineHeight: 13,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: colors.muted,
  },
} satisfies Record<string, TextStyle>;
