import { ProductCard, type ProductCardProps } from "./ProductCard";
export type ProductTileProps = Omit<ProductCardProps, "variant"> & {
  compact?: boolean;
};
/** Original vertical card, with a compact variant and caller-selected image height. */
export function ProductTile({ compact, ...props }: ProductTileProps) {
  return (
    <ProductCard {...props} variant={compact ? "vertical-small" : "vertical"} />
  );
}
