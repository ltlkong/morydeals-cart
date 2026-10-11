import type { ImageSourcePropType } from "react-native";
import type { PriceSparkTrend } from "./PriceSpark";

export type ProductTag = {
  label: string;
  tone?: "neutral" | "accent" | "success";
};
/** Presentation only: formatted amounts and claims belong to the host. */
export type ProductCardData = {
  title: string;
  imageUrl?: string | null;
  price?: string | null;
  was?: string | null;
  badge?: string;
  productTags: readonly ProductTag[];
  where?: string;
  trend?: PriceSparkTrend & { label: string };
  noPriceLabel?: string;
};
export type ProductCardVariant = "horizontal" | "vertical" | "vertical-small";
export type ProductImageProps = {
  source?: ImageSourcePropType;
  width: number;
  height: number;
};
