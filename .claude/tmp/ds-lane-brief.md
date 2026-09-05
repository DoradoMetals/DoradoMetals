# Design-system lanes, 2026-09-04. Repo /home/jtj60/dorado-exchange, branch ds/library-followups.

Other agents are live in this checkout. Touch ONLY the files your prompt assigns.

## Hard rules
- NO comments in any file, ever. Strip pre-existing comments from any file you edit. Knowledge goes in packages/components/README.md.
- No text-styling utilities (text-sm, font-medium, tracking-*, leading-*, text-muted-foreground on text...). Semantic HTML styled by packages/theme/typography.css:
  h1-h6, p, small, strong, plus classes .display .stat .stat-sm .micro .eyebrow .nav-link and data-emphasis="default|subtle|subtlest" for colour emphasis.
  Figma Text tags map: Small/Medium -> <small><strong>? NO: Small -> <small>, Micro -> <span className="micro">, Eyebrow -> .eyebrow, H5 -> <h5>. Medium weight variants come from the tag itself where typography.css gives one; do not add font-medium.
- Tokens only from packages/theme/theme.css (bg-background, border-border, text-foreground, text-muted-foreground on non-text elements like icons is fine, bg-secondary, text-success, text-destructive, foreground-placeholder is `text-foreground-placeholder`...). Never a raw hex.
- Icons ONLY from @dorado/icons (Lucide re-exports + brand marks). Library components import icons from @dorado/icons too.
- Components are Tailwind + cva + cn(), forwardRef where a DOM node is exposed, 'use client' only when hooks are used. Read packages/components/README.md first: it holds the component contract, the Figma node table and the conventions. Read one neighbour (hero/Hero.tsx, marquee/Marquee.tsx) before writing.
- Tests: colocated *.test.tsx, vitest + testing-library, and an axe check via `import { axeViolations } from "../test/axe"` — `expect(await axeViolations(container)).toEqual([])`.
- Do NOT edit packages/components/src/index.ts. Report the export lines you need and I add them.
- Do not commit. Do not touch api/.
- The Figma descriptions are the contract; the drawing is evidence. Hallmarks the drawing cannot show (focus-visible ring, aria, keyboard, prefers-reduced-motion) are still required.

## Verify - all four must pass before you report
pnpm --filter @dorado/components typecheck
pnpm --filter @dorado/components test
pnpm --filter @dorado/frontend typecheck
pnpm --filter @dorado/frontend test

## Report
Files added/changed/deleted, export lines needed, visible changes a user would notice, anything the drawing asked for that you could not do and why.
