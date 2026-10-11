# MoryDeals UI

`@morydeals/ui` is a shared React Native / Web presentation library. Import from its public entrypoint. Hosts supply data, labels, clipboard callbacks and navigation. The showcase owns sample data; the library has no API clients or persistence.

## Organization

| Folder | Responsibility |
| --- | --- |
| `theme/` | Original generated tokens, Nunito typography, fonts and Mory colors |
| `primitives/` | Accessible animated Pressable |
| `actions/` | Button and IconButton |
| `inputs/` | Selection chips |
| `feedback/` | Status badges |
| `content/` | Copy, MoryDeals wordmark and brand decoration |
| `commerce/` | Card contracts, image, metadata, card shapes, mini history, purchase control and coupon card |
| `layout/` | Cross-platform masonry and stable image geometry |
| `data/` | Detailed price chart |
| `chat/` | Dock composition, snap geometry, gesture hook, isolated input, thread and Mory reaction |
| `overlays/` | Sheet |
| `motion/` | Content phase transition |
| `mory/` | Character composition, presets, artwork and animation channels |

`src/index.ts` is the public surface. Internal components import their direct dependencies, never the package barrel. No combined `primitives.tsx` or duplicate root component implementations remain.

## Product cards

The previous main branch's ProductTile and ProductRow establish the hierarchy: image, two-line title, compact tags, price and struck previous price, then merchant alongside PriceSpark. Three shapes share ProductCardContent:

- `ProductRow`: horizontal, with an 88 px image by default.
- `ProductTile`: vertical, with a caller-selected image height.
- `ProductTile compact`: small vertical, with a 112 px image by default.
- `ProductCard variant`: the same shapes as `horizontal`, `vertical`, `vertical-small`.

There is no separate price-drop percentage, trend sentence, brand line, repeated subtitle or timestamp row. Labels and prices are presentation values. `noPriceLabel` describes missing prices. Trend claims are supplied by the host and included in the spoken card label.

```tsx
<ProductTile
  card={{ title, price, was, productTags, where, trend }}
  width={180}
  imageHeight={imageHeightOf(key)}
  source={{ uri: photoUrl }}
  action={<PurchaseButton {...purchaseProps} />}
  onPress={openDetails}
/>
```

The action is a sibling of the details Pressable. Copying or buying never triggers card navigation. `renderImage({ width, height })` is an optional presentation slot; image geometry is fixed before loading.

PriceSpark is copied from the old package. Its chronological shape is normalized 0–100; states are low, drop and steady. Fewer than two points render nothing. Omit it if history is unavailable.

## Coupon → Buy now

PurchaseButton adapts the original component: coupon → asynchronous clipboard request → Copied for 350 ms → Buy now, with PhaseFade. A missing coupon starts at Buy now. Duplicate requests are blocked; changing the coupon resets the phase. Clipboard failure shows selectable code and an alert, then enables buying. The host implements `onCopy` and `onBuy`; no retailer navigation is embedded.

```tsx
<PurchaseButton
  couponCode={code}
  copyLabel="Copy coupon" copiedLabel="Copied!"
  copyErrorLabel="Copy failed. Select the code below."
  buyLabel="Buy now"
  onCopy={copyToClipboard} onBuy={openMerchant}
/>
```

## Masonry

Masonry uses the original stable `imageHeightOf` table, now in layout. Supply item geometry and a bounded width. Items fill the shortest column without waiting for image loading; resizing recomputes the columns. This showcase-scale wall is intentionally non-virtualized. An application with a long feed should supply its virtualized host list around ProductTile.

## Assistant dock

AssistantDock adapts the old main branch's three anchors, keeping handle and input measurements separate from the animated thread. It is absolutely positioned at the bottom of a bounded relative parent. It supplies:

- folded, half and full snap points, clamped to available space and keyboard geometry;
- drag plus velocity projection, and a 220 ms ease-out settle;
- handle tap, arrow-key/Home/End controls on web, and native accessibility actions;
- a fixed composer while the thread grows, a separate page action line that fades and folds;
- top corners that flatten when full reaches the parent boundary;
- a leading action that narrows/fades while typing;
- Mory peeking at the edge, rising to type along, scanning, and reacting to success/failure.

```tsx
<View style={{ height: canvasHeight, position: 'relative' }}>
  <AssistantDock
    availableHeight={canvasHeight}
    messages={messages} onSend={handleSend}
    actionLine={pageActions}
    leadingAction={shoppingOptions}
  />
</View>
```

Optional `snap` / `onSnapChange` provide controlled anchors; `keyboardInset` lets a host supply keyboard geometry. Otherwise the native keyboard events supply it. Draft state lives in DockInput so typing does not render the conversation. Returning false from onSend retains the draft. Messages support card/content slots. Internal transitions honor Reduce Motion. The host must avoid applying a second keyboard inset to the same dock container.

## Mory

`types.ts` and `poses.ts` resolve presets. `parts/` contains body, face, hands and fruit; `props/` contains objects and hand anchors; `motion/` contains gesture timing. MoryFigure composes independently animated layers on one 200 × 200 coordinate grid. Mory manages live/still clocks and entrance lifecycle.

```tsx
<Mory size={200} holding="heart" headpiece="apple" expression="wink"
  motion={{ hands: 'wave', body: 'bob', eyes: 'blink', headpiece: 'sway' }} />
```

Tag is a level dollar label; deals is a stack of percent coupons. Peek/edge draw no board. `moryEdgeAt(size)` aligns the hands to a consumer surface. `still` uses one SVG; small figures are static by default. `keystrokes` lets the host synchronize typing.

## Reference and checks

Reference: `morydeals-affiliate` origin/main at `edfa45c1930a03315c9e5dab75346f4e20b5d5b1`. Tokens, typography and PriceSpark were copied; card hierarchy, PurchaseButton and dock behavior are adapted with explicit presentation-only contracts. See `docs/design/direction.md` for provenance and differences.

Run `npm run check` and `npm run build:web` at the repository root. Browser/native interaction evidence is separate from compilation and pure geometry tests.

### Integrated dock navigation

`DockNavigation` takes controlled `items`, `selectedKey`, `onSelect`, and optional `onStep` feedback. Each item supplies its accessible label and icon renderer. Pass it into `AssistantDock.leadingAction` with `leadingActionWidth={dockNavigationWidth(items.length)}`. The dock collapses this slot while composing; navigation state and routing belong to the consumer.
