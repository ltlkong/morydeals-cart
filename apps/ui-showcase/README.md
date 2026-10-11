# MoryDeals UI Showcase

An Expo presentation project consuming @morydeals/ui on Web and native with the same source.

From the workspace root:

```sh
npm run web
npm run ios
npm run android
```

Eight sections cover overview, foundations, Mory, cards, history, coupons, chat and sheets. Desktop has a gallery sidebar; narrow screens have top category controls. These controls navigate the showcase. The actual chat dock has no bottom navigation tabs.

Mory controls combine parts, toggle motion, replay entrance and connect keyboard strokes. Preset galleries render still artwork to avoid running a clock for every thumbnail.

All histories and replies are presentation fixtures. The coupon button exercises the platform clipboard with a demo code. The generated product contact sheet is cropped at render time only in this showcase; the UI package accepts ordinary image sources.

Cards expose all three shapes, masonry/grid and clipboard failure preview. The dock exposes folded/half/full positions, keyboard geometry, activity reactions, draft retention and a full-screen preview using the same shared component.

npm run check validates tokens, TypeScript, Mory composition, masonry assignment and dock geometry. npm run build:web exports the gallery to apps/ui-showcase/dist.
