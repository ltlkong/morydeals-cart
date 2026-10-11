import { ProductCard, type ProductCardProps } from "./ProductCard";
export type ProductRowProps = Omit<ProductCardProps, "variant" | "imageHeight">;
export function ProductRow(props: ProductRowProps) {
  return <ProductCard {...props} variant="horizontal" />;
}
