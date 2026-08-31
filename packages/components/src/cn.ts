// The one class combiner. NOT the stock recipe: tailwind-merge must be TAUGHT
// the semantic type scale, or it classifies `text-small`/`text-h1` as colours
// and lets a later text-COLOUR silently delete the font size (and vice versa).
// The app's shared/utils/cn carries the full war story; the short version is
// that stock twMerge('text-small', 'text-primary-foreground') returns only the
// colour, cva emits size before the colour compound, and so every component
// composed here was shipping DOM with no font-size class at all. This file
// claimed to be "the same recipe as the app's" while being the stock one -
// which reintroduced the exact bug the app's cn exists to prevent, inside
// every component of this package. Found by porting the Button law test in.
//
// ADDING A SIZE TOKEN: add the `--text-<name>` triple to @dorado/theme's
// typography.css AND the name here. A token missing from this list is a size
// that disappears whenever a colour is merged next to it.
import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

export const SEMANTIC_TEXT_SIZES = [
  "display",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "body",
  "small",
  "micro",
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...SEMANTIC_TEXT_SIZES] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
