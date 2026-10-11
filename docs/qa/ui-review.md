# MoryDeals UI reference correction

Reference source: morydeals-affiliate origin/main, edfa45c1930a03315c9e5dab75346f4e20b5d5b1. The source checkout was read with git show and was not modified.

Changes reviewed:
- Original card hierarchy in horizontal, vertical and compact vertical forms; separate card/detail and purchase actions.
- Shared masonry with stable media geometry and grid switching.
- Copied → Buy now transition, duplicate-copy guard, clipboard-error alert and selectable fallback code.
- Shared dock with independently measured handle/input, three anchors, action-line fade, leading-control fade, keyboard geometry, Mory rise/typing/reactions and top merge.
- Folder organization by responsibility and MoryDeals branding/package names.

Browser evidence:
- Desktop 1280px and mobile 402px: all three shapes, masonry, detail modal and purchase callbacks.
- Coupon copy reached Copied and then Buy now without opening details. Failure showed an alert plus code, and retained the buy action.
- Draft submission produced a reply and cleared the input. A rejected submission retained the new isolated input draft.
- Half → full drag reached the full parent height (620px), and corners reached 0px. Handle keyboard controls also opened the dock.
- Composer clearance stayed 15px at half and full. A 180px keyboard preview reduced full height to 440px and raised input clearance to 195px.
- No browser errors/warnings in the final review.

Native evidence:
- Expo Go, iPhone 17 Pro / iOS 26.5: compact and horizontal cards rendered with mini charts; coupon action switched to Buy now.
- Full-screen dock preview: handle tap opened half; native accessibility Expand reached full; composer remained at the bottom.
- Native text-entry/keyboard and drag automation were not successfully verified in this pass. Android and physical devices are untested.

Local checks: tokens, TypeScript, 7 pure composition/layout tests and Web export. These do not establish assistant/backend behavior. Gallery prices, coupon codes and responses are sample fixtures.
