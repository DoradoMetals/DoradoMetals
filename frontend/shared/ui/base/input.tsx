import * as React from 'react'

import { cn } from '@/shared/utils/cn'

/* ONE INPUT, ONE APPEARANCE. No variant axis (Jacob, ruling 28):
   "We don't need input variants. In fact, you should get rid of the
   bg-transparent etc classes everywhere they're used. We only want one input."

   WHAT WAS HERE AND WHY IT WENT. The axis was `default | filled | ghost`, and
   it existed to absorb call-site overrides rather than to express a design:
     - `default` — `border border-input bg-transparent`
     - `filled`  — `border border-border bg-highest`, for the 11 sites reaching
                   through `ValidatedField`
     - `ghost`   — `border border-transparent bg-transparent`, used by nobody
   Three treatments is the app having never decided what a field looks like.
   The P2 sweep found exactly that and asked which was real; this is the answer.

   THE ONE APPEARANCE IS THE HAIRLINE ONE, and the reason is ruling 19: a field
   is a surface distinguished by a BORDER, not by a fill jump and not by a
   shadow (ruling 27 deleted the shadows outright). `bg-transparent` here is not
   a call-site "no chrome" override — it is the field declaring that it takes
   the colour of whatever panel it sits on, which is what makes one input work
   on the page ground, on a card and inside a drawer without three variants.
   It is also the treatment the overwhelming majority of call sites already
   render, so collapsing onto it changes the fewest fields.

   FOCUS IS THE BORDER GOING UP ONE STEP, matching Button's hover rule: the
   same escalation vocabulary, so a focused field and a hovered button read as
   the same system.

   `text-base` (16px) is deliberate and must not become `text-small`: iOS
   Safari zooms the viewport when a focused input's font-size is under 16px.
   That is a mobile BEHAVIOUR, not a look, which is why it does not come from
   the semantic type scale. Do not "fix" it. */
const INPUT_CLASS =
  'text-foreground file:text-foreground placeholder:text-neutral-500 selection:bg-primary selection:text-primary-foreground flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base transition-[color,box-shadow] outline-none focus-visible:border-border-strong file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50'

export type InputProps = React.ComponentProps<'input'>

function Input({ className, type, ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(INPUT_CLASS, className)}
      {...props}
    />
  )
}

export { Input, INPUT_CLASS }
