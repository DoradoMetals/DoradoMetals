# Header / Footer / Marquee - Figma drawings, pulled 2026-09-04 (file 8A73quhBLBqotJlX95jN9j)

## Header - component set 51:58, variants Layout x Drawer Open x Signed In
- Desktop signed-out 51:46 / signed-in 140:985 / drawer-open 81:44; Mobile 51:57 / drawer-open 81:31
- Bar: bg background, border-b hairline border, h-64 desktop (px-32) / h-72 mobile (px-16), flex justify-between
- Brand: Logo/Symbol 34:9 (DM monogram, fill = foreground) at 41x20 desktop, 49x24 mobile
- Desktop Nav: gap-24, links How it works / Pricing / About / Contact as Link nav variant (Small/Medium, muted-foreground at rest)
  then a 1px x 20px Divider (bg border) then EITHER auth CTAs (signed-out) OR Avatar SM 28px with initials (signed-in, opens ProfileMenu)
- Drawer Open=True: trailing affordance becomes X (24px) - hamburger on mobile, full nav on desktop is REPLACED by the X
- Description: "PRODUCT link removed (the storefront IS the product)... Nav links are the Link component in its quiet state."

## Footer - component set 76:177, Layout=Desktop 51:191 / Mobile 76:176
- Desktop: border-t hairline, px-64 pt-48 pb-32, flex-col gap-48, w-full
  - Columns row justify-between: Brand (w-500: logo 48x24, tagline Small/Regular muted "Fast. Insured. Paid the day it arrives.", Button primary "Get a Quote" h-44 px-24 (LG)),
    then Link columns (flex-1 justify-between): Product [How it works, Pricing, What we buy, Payouts, Security] / Company [About, Locations, Careers] /
    Resources [Spot prices, Purity guide, Shipping, FAQ, Support] / Connect [Instagram, Facebook, Youtube, X, LinkedIn]
  - Column heading: H5/H6 SemiBold at foreground-placeholder (#787c87). Links: Link component, Small/Medium, foreground (text/default).
  - Legal row justify-between: "© Dorado Metals Exchange LLC 2026" left; Privacy / Terms / Accessibility right (gap-16). No social row on desktop.
- Mobile: border-t, px-24 pt-32 pb-24, flex-col gap-12 items-center
  - Brand centred: logo 84x42, tagline "Fast. Insured. Paid on arrival.", Button primary SM (h-30 px-12 micro) "Get a Quote"
  - Columns: WRAPPING row w-324, gap-24, py-16, five 150px cells: Product [How it works, Pricing, What we buy, Payouts] / Metals [Gold, Silver, Platinum, Scrap] /
    Company [About, Locations, Careers] / Connect [Contact us, Support] / Legal [Privacy, Terms]; headings H6 at placeholder
  - Bottom row h-24 justify-between: "© 2026" left; Social right gap-12: instagram, facebook, x, youtube, linkedin as Icon Button (457:75) tertiary SM-ish 20px, brand SVGs (Brand Logos page 442:*/446:*) white/subtlest. MOBILE ONLY.
- Description says content is placeholder taxonomy; the layout law is what matters.

## Marquee - 170:48 (page 170:46)
- Band: border-t + border-b hairline, px-24 py-12, flex gap-32 items-center, whitespace-nowrap
- Cell: flex gap-8 items-center: label Micro/Medium at foreground-placeholder; price Small/Medium at foreground; delta Micro/Regular at success or destructive
- Motion: continuous translateX loop, content duplicated 2x, ~30s, pauses on hover & focus-within, motion-reduce = static overflow-x scroll. Renders children, never fetches.
- Library Marquee already exists (packages/components/src/marquee/Marquee.tsx) - check its band/px/py match (Figma px-24 py-12 vs code px-6 py-3 = same) and build the spots cell on top.

## Also new in Figma since the README audit (not built): Icon Button 457:75, Logo set 530:22 + Brand Mark 435:3, Brand Logos 442:5..446:19, Chat 619:*, Option Card 22:22 / Option Row 22:37, Radio Tile 31:59 / Chip 31:78 / Card 99:119, Logo Loader 42:142, Tab Bar / Underline 160:45, Popover 106:213, Breadcrumb 126:3, Masked Field marked (deprecated).
