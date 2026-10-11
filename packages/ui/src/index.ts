/** Public Web / React Native UI surface. Internal modules use direct imports. */

// Theme
export * from "./theme/index";

// Foundations and actions
export * from "./content/Copy";
export * from "./content/Brand";
export { LogoCarousel } from "./content/LogoCarousel";
export * from "./actions/Button";
export * from "./actions/IconButton";
export { MoryFab, type MoryFabAction } from "./actions/MoryFab";
export * from "./inputs/Chip";
export * from "./inputs/SearchField";
export { Wordmark } from "./content/Wordmark";
export * from "./feedback/Badge";
export {
  MoryState,
  MORY_STATE_SCENES,
  type MoryStateKind,
} from "./feedback/MoryState";

// Overlays and commerce
export * from "./overlays/Sheet";
export * from "./commerce/ProductCard";
export * from "./commerce/ProductTile";
export * from "./commerce/ProductRow";
export * from "./commerce/ProductImage";
export * from "./commerce/ImageGallery";
export * from "./commerce/ListCover";
export * from "./commerce/PurchaseButton";
export * from "./commerce/TagRow";
export { PageStrip, PAGE_STRIP_HEIGHT } from "./commerce/PageStrip";
export type {
  ProductCardData,
  ProductCardVariant,
  ProductTag,
} from "./commerce/product-card";

// Layout, charts and assistant
export * from "./layout/Masonry";
export {
  IMAGE_RATIO_FALLBACK,
  IMAGE_RATIO_MAX,
  IMAGE_RATIO_MIN,
  imageRatio,
  type ImageSize,
} from "./layout/image-ratio";
export { useMeasuredItems } from "./layout/useMeasuredItems";
export { MoryField } from "./layout/MoryField";
export {
  PullToRefresh,
  useMinimumRefresh,
  MIN_REFRESH_MS,
} from "./layout/PullToRefresh";
export { imageHeightOf } from "./layout/masonry-layout";
export * from "./data/PriceChart";
export * from "./data/price-history";
export * from "./content/PriceHistory";
export * from "./chat/AssistantDock";
export * from "./commerce/CouponCard";
export {
  Pressable,
  PRESSED_SCALE,
  usePressScale,
  type PressState,
} from "./primitives/Pressable";
export {
  PriceSpark,
  type PriceSparkTrend,
  type PriceSparkState,
} from "./commerce/PriceSpark";
export { PhaseFade } from "./motion/PhaseFade";
export { PageFade } from "./motion/PageFade";

// Mory: composable artwork and motion
export { Mory, moryEdgeAt, LIVE_FROM, type MoryPose } from "./mory/Mory";
export { MorySilhouette, SILHOUETTE_FACES } from "./mory/MorySilhouette";
export { MotionPause } from "./mory/motion-pause";
export { DealTag } from "./mory/DealTag";
export {
  MoryAvatar,
  MORY_AVATAR_SIZES,
  type MoryAvatarSize,
} from "./mory/MoryAvatar";
export { BrandSparkles } from "./content/BrandSparkles";
export type {
  MoryProps,
  MoryHolding,
  MoryHeadpiece,
  MoryExpression,
  MoryHandMotion,
  MoryMotion,
} from "./mory/types";
export {
  MORY_POSES,
  resolveMory,
  DEFAULT_MORY_LOOK,
  type MoryLook,
} from "./mory/poses";
export { MoryLookProvider, useMoryLook } from "./mory/look";
export { MoryBodyPart, MoryShadowPart } from "./mory/parts/body";
export { MoryExpressionPart } from "./mory/parts/face";
export { MoryHeadpiecePart } from "./mory/parts/headpiece";
export { MoryHandPart } from "./mory/parts/hands";

export * from "./chat/DockNavigation";
export * from "./navigation/tab-bar/FloatingTabBar";
