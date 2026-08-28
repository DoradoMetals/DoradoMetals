import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/* ============================================================================
   cn() — clsx + tailwind-merge, TAUGHT ABOUT THE SEMANTIC TYPE SCALE.
   ----------------------------------------------------------------------------
   THE BUG THIS FILE EXISTS TO PREVENT, and it was live and silent:

     stock twMerge('text-small', 'text-primary-foreground')
       -> 'text-primary-foreground'          THE SIZE IS GONE

   tailwind-merge resolves `text-*` by consulting a table of known font sizes
   (`text-sm`, `text-base`, `text-xl` ...) and treating everything else it sees
   after `text-` as a COLOUR. `--text-small`, `--text-h1` and the rest are ours,
   declared in `app/styles/theme.css`, so they are not in that table: twMerge
   classified every semantic size as a colour and let a later colour REPLACE it.
   The mirror case is just as bad — `twMerge('text-foreground', 'text-small')`
   dropped the COLOUR.

   WHY IT MATTERED MORE THAN A COSMETIC SLIP. Every shared component composes
   its classes through cn(), and `cva` emits the `size` variant BEFORE the
   compound variant that carries the colour. So `buttonVariants({})` produced
   `h-10 px-4 bg-primary text-primary-foreground` with NO font-size at all, and
   every button in the app silently inherited its parent's. At the same time
   three sweep agents were deleting ~700 `text-sm`/`text-base` utilities from
   call sites ON THE PROMISE that the size variant or the semantic tag supplies
   the size. Nothing failed: no type error, no test, no lint. The foundation's
   whole type scale was being thrown away one cn() call at a time.

   THE FIX. Register the semantic sizes in tailwind-merge's `font-size` class
   group. An exact class-part match beats a validator in twMerge's lookup, so
   `text-h1` now resolves as a size and stops colliding with `text-destructive`.
   Pinned by `cn.test.ts`, which runs the exact probe above in both orders.

   ADDING A SIZE TOKEN: add the `--text-<name>` triple to theme.css AND the name
   here. They are two halves of one decision — a token missing from this list is
   a size that disappears whenever a colour is merged next to it.

   KNOWN AND DELIBERATELY NOT CHANGED — the named SPACING scale
   (`--spacing-xs..3xl` -> `p-md`, `gap-lg`, `m-xl`, `space-y-sm`). twMerge does
   not know those either, but the failure mode is different and much milder:
   `cn('p-4', 'p-md')` keeps BOTH and the stylesheet's emit order decides, so
   nothing is silently deleted. Teaching twMerge about them would change which
   of two competing paddings wins at call sites that were authored against the
   current behaviour, mid-sweep, with no staging environment. Flagged for a
   deliberate pass of its own, not smuggled in behind a font-size fix.
   ============================================================================ */

/** The `--text-*` tokens declared in `app/styles/theme.css`. Keep in sync. */
export const SEMANTIC_TEXT_SIZES = [
  'display',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'body',
  'small',
  'micro',
] as const

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...SEMANTIC_TEXT_SIZES] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
