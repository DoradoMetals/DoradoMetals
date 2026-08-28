# Deletion order — when each retired class is safe to delete

Ruling 16: *"They should be deleted and updated in call-sites."* Not neutered.

This file exists because the deletion is **partitioned across agents**, and a
class deleted while a call site still spells it produces **no error, no type
failure, and no test failure** — just an element that quietly loses its
styling. There is no staging environment and `master` auto-deploys, so the
stylesheet deletion has to happen last, once every partition reports in.

**Counts below are live**, taken after P0 (`shared/**` + `app/styles/**`)
finished. Regenerate before deleting anything:

```bash
cd frontend
for c in on-glass raised-off-page glass-divider separator-inset section-label \
         primary-on-glass destructive-on-glass success-on-glass glass-panel \
         glass-card recessed-into-page input-floating-label-form checkbox-form \
         radio-group-buttons floating-label tab-indicator-primary \
         tab-indicator-secondary liquid-gold drawer-layout animate-shine; do
  printf "%-28s %s\n" "$c" "$(grep -roE "\b$c\b" app features shared \
    --include='*.tsx' --include='*.ts' | wc -l)"
done
```

---

## Status board

`shared/**` is **DONE** — zero call sites for every class below. Every
remaining occurrence belongs to another partition.

| class | defined in | remaining | files | wave-3 | other partitions | delete when |
|---|---|---:|---:|---:|---:|---|
| `on-glass` | glass.css | **178** | 28 | 58 | 120 | P1+P2+P3 **and** wave 3 |
| `raised-off-page` | components.css | **116** | 64 | 25 | 91 | P1+P2+P3 **and** wave 3 |
| `glass-divider` | glass.css | 48 | 12 | 16 | 32 | P1+P2+P3 **and** wave 3 |
| `section-label` | components.css | 40 | 12 | 5 | 35 | P1+P2+P3 **and** wave 3 |
| `primary-on-glass` | glass.css | 23 | 10 | 14 | 9 | P1+P2+P3 **and** wave 3 |
| `separator-inset` | components.css | 22 | 13 | 0 | 22 | **P1+P2+P3 only** |
| `destructive-on-glass` | glass.css | 20 | 7 | 1 | 19 | P1+P2+P3 **and** wave 3 |
| `success-on-glass` | glass.css | 20 | 7 | 1 | 19 | P1+P2+P3 **and** wave 3 |
| `floating-label` | components.css | 15 | 9 | 0 | 13 (+2 shared*) | **P1+P2+P3 only** |
| `input-floating-label-form` | components.css | 13 | 7 | 0 | 13 | **P1+P2+P3 only** |
| `glass-panel` | glass.css | 7 | 7 | 3 | 4 | P1+P2+P3 **and** wave 3 |
| `checkbox-form` | components.css | 6 | 5 | 2 | 4 | P1+P2+P3 **and** wave 3 |
| `radio-group-buttons` | components.css | 5 | 5 | 0 | 5 | **P1+P2+P3 only** |
| `tab-indicator-primary` | gradients.css | 5 | 3 | 0 | 5 | **P1+P2+P3 only** |
| `glass-card` | glass.css | 3 | 3 | 0 | 3 | **P1+P2+P3 only** |
| `recessed-into-page` | components.css | 3 | 3 | 1 | 2 | P1+P2+P3 **and** wave 3 |
| `tab-indicator-secondary` | gradients.css | 1 | 1 | 0 | 1 | **P1+P2+P3 only** |
| `liquid-gold` | gradients.css | 1 | 1 | 0 | 1 | **P1+P2+P3 only** |
| `animate-shine` | theme.css | 1 | 1 | 1 | 0 | **wave 3 only** |
| `drawer-layout` | drawer.css | 1 | 1 | 0 | 0 | see note |
| `secondary-on-glass` | glass.css | **0** | 0 | 0 | 0 | **DELETE NOW — free** |

\* `floating-label`'s 2 remaining `shared/` occurrences are the CSS selector
pair in `components.css` itself (`.peer:focus ~ .floating-label`), not call
sites.

**`drawer-layout`** is the one class that is not decoration: it is the drawer's
geometry (fixed positioning, responsive widths, scroll behaviour). Its shadow
is already a token. It should be **kept** and moved into `@layer components`,
or lifted into the Drawer component — it is not a ruling-16 target.

---

## The conversion each class takes

Apply these at the call site, then delete the rule. **Deleting the shadow
classes replaces them with nothing** — ruling 19: flat surfaces separated by
hairlines *is* the design.

| class | replace the call site with |
|---|---|
| `on-glass` | `bg-transparent border border-border` (drop any `text-` it was masking — see the precedence trap below) |
| `glass-panel` | `bg-highest border border-border` |
| `glass-card` | `bg-card border border-border` |
| `glass-divider` | `<Separator />`, or `w-full h-px bg-border` |
| `primary-on-glass` | `<Button variant="secondary">`, or `bg-primary/15 border border-primary text-primary` |
| `destructive-on-glass` | `<StatusChip tone="negative">`, or `<Button variant="tertiary" intent="danger">` |
| `success-on-glass` | `<StatusChip tone="positive">` |
| `secondary-on-glass` | — (dead) |
| `raised-off-page` | **nothing.** Delete it. If the element needed separation it gets `border border-border`. |
| `recessed-into-page` | **nothing.** |
| `separator-inset` | `<Separator />`, or `h-px w-full bg-border` |
| `input-floating-label-form` | `<Input variant="filled">` / `<Textarea variant="filled">` |
| `checkbox-form` | *(nothing — `Checkbox`'s own default is correct now)*. The check icon named `text-primary`, a near-WHITE tick on the near-white `data-[state=checked]:bg-primary` box, and `.checkbox-form`'s `bg-card` was the only thing making it legible — on "Remember me" and on the terms checkbox that GATES SIGN-UP. The icon now inherits (`text-current`), so it resolves correctly **with or without** the class: the bare checkbox gets a dark tick on a white box, and a `.checkbox-form` one keeps a white tick on a card box. **The deletion is therefore safe on its own schedule** rather than having to land in lockstep. |
| `radio-group-buttons` | **`<RadioCard>`** (`shared/ui/RadioCard.tsx`) — ⚠ NOT a plain deletion: this class carries `relative`, and the paired `after:absolute after:inset-0` on the hidden input is what makes the whole card clickable and what the checkmark positions against. Dropping it without adopting `RadioCard` breaks the control's hit area, which no screenshot and no test will show. |
| `section-label` | `.eyebrow` (typography.css) — same intent, monospace, and it is a token-driven utility rather than a hand-rolled class |
| `tab-indicator-primary` | `<TabsTrigger variant="underline">` — **the variant now exists**; also drop `bg-transparent rounded-none px-0` from the `TabsList` and pass `variant="underline"` there |
| `tab-indicator-secondary` | `<TabsTrigger variant="underlineSubtle">` — same, in `--border-strong` |
| `liquid-gold` | `bg-brand` |
| `animate-shine` | **nothing** — the keyframes are already a no-op |

---

## ⚠ THE PRECEDENCE TRAP — read before deleting `on-glass` or anything in `components.css`

`globals.css` imports `glass.css` and `components.css` **without a `layer()`**,
so their rules are **unlayered**, and unlayered normal declarations beat
**every** cascade layer — `utilities` included.

That means this, today, renders `on-glass`'s colour and **not** `text-neutral-600`:

```jsx
<div className="on-glass text-neutral-600">
```

**So deleting the class is not automatically a no-op.** The utility sitting
beside it becomes live for the first time, and the element can change
appearance in a way that is not what the file looked like before. Check every
pair; do not assume.

Two real examples found and handled in `shared/`:

- `SchedulePicker.tsx:120` — `text-neutral-900 font-normal on-glass`. `on-glass`
  was winning with `text-foreground`. Deleting it makes `text-neutral-900` live.
  Both are near-white (`#f3f4f7` vs `#f6f7f9`), so it was safe — **verified, not
  assumed.**
- `PopoverSelect.tsx:87` — `on-glass hover:on-glass`. **`hover:on-glass` never
  did anything**: `.on-glass` is a plain CSS class, not a registered
  `@utility`, so Tailwind emits no `hover:` variant for it. Dead string, dropped.

The same trap applies to `.shadow` in `components.css`, which collides with
Tailwind's own `shadow` utility and **wins**. Only 2 bare `shadow` spellings
exist in the tree, so it is not biting today, but it dies with the file.

---

## Order of operations

1. **Now, free:** delete `.secondary-on-glass` from `glass.css` (0 call sites).
2. **Each partition** converts its own call sites and updates the table above.
3. **When a row reads 0**, delete that rule.
4. **When `glass.css` is empty**, remove it and its `globals.css` import.
   Likewise `gradients.css`.
5. `components.css` keeps only `.floating-label` and the `number-flow-react`
   part padding, both of which are real. `drawer.css` survives as geometry.
6. **`base.css`'s `bg-primary` + `text-white` bridge dies with the last
   `text-white` on a `bg-primary` element.** See the next section.

---

## The `base.css` bridge — NOT YET SAFE TO DELETE

`base.css` carries a compatibility shim in `@layer utilities` matching
`.bg-primary.text-white` and its `!`, `hover:` and `has-[]` spellings, and
repainting them `--primary-foreground`. Its own author calls it a crutch.

P0 converted **41 of 52** lines. **11 remain, all in `features/orders`, which
is wave-3 territory P0 may not touch:**

```
features/orders/purchaseOrders/users/purchaseOrderTab.tsx:76
features/orders/purchaseOrders/users/purchaseOrderDrawer/drawerContents/Cancelled.tsx:34
features/orders/salesOrders/users/salesOrderTab.tsx:88
features/orders/salesOrders/admin/createSalesOrder/createSalesOrderDrawer.tsx:699
features/orders/salesOrders/admin/createSalesOrder/createSalesOrderDrawer.tsx:713
features/orders/ui/OrderStatusShared.tsx:71,72,128,129,171,172
```

Note `OrderStatusShared.tsx` uses the `bg-primary!` spelling, which the bridge
covers and a naive grep for `bg-primary ` does not.

**Deleting the bridge now makes those 11 buttons white-on-white.** Confirm with:

```bash
cd frontend && grep -rn 'bg-primary' app features shared --include='*.tsx' \
  | grep 'text-white' | grep -v 'shared/ui/CountBadge.tsx'      # must be 0
```

The `CountBadge.tsx` exclusion is not a cheat: that file's doc comment quotes
the hand-rolled badge it replaced, `text-white` and all, as the "before"
example. It is prose, not a call site. Two other spellings the naive grep
misses and the bridge covers: `bg-primary!` (used 4x in `OrderStatusShared.tsx`)
and the `has-[[data-state=checked]]:` pair.

Only when that prints nothing does the bridge block come out of `base.css`.
