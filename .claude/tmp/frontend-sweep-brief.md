# Frontend design-system sweep brief (2026-09-03)

Repo root: /home/jtj60/dorado-exchange. Work ONLY inside the directories your
task prompt assigns you. Other agents are working in the rest of the tree
concurrently.

Jacob's instruction: "run through the current frontend, and replace tokens with
our design tokens, typography with our typography, and components with our
components."

## The three sweeps, in priority order

### 1. Typography -> the theme ramp
Replace every raw Tailwind size with the theme token that matches:

| raw | token | px |
|---|---|---|
| `text-xs` | `text-micro` | 12 |
| `text-sm` | `text-small` | 13 |
| `text-base` | `text-body` | 15 |
| `text-lg` | `text-h4` | 18 |
| `text-xl` | `text-h3` | 22 |
| `text-2xl` | `text-h2` | 28 |
| `text-3xl` | `text-h1` | 36 |
| `text-4xl`+ | `text-display` | 64 |

Also replace arbitrary sizes like `text-[13px]`. Other ramp members:
`text-h5` 16, `text-h6` 14, `text-stat` 36, `text-stat-sm` 30. For an animated
figure use the `.stat` / `.stat-sm` utilities, which carry `tabular-nums`.

Note `text-sm` -> `text-small` is 14px -> 13px and `text-base` -> `text-body` is
16px -> 15px. Both are deliberate: the theme ramp is denser than Tailwind's.

### 2. Colour -> semantic tokens
Replace raw hex and raw Tailwind palette colours with the semantic names:
`bg-background`, `bg-card`, `bg-popover`, `bg-muted`, `bg-secondary`,
`bg-accent`, `bg-highest`, `text-foreground`, `text-muted-foreground`,
`text-subtle`, `text-placeholder`, `text-foreground-disabled`, `border-border`,
`border-border-strong`, `border-input`, and the status families `success`,
`destructive`, `warning`, `info`, each with a `-foreground` and a `-muted`
surface. The gold brand colour is `--color-brand` / `text-brand`.

If a raw hex has no semantic equivalent, LEAVE IT and report it. Do not invent
a token; `packages/theme` is off limits to you.

### 3. Components -> @dorado/components
Swap a local component for the library one ONLY where the library genuinely has
an equivalent and the prop API lines up. Available exports are listed in
`packages/components/src/index.ts`. The safe swaps are `Input`, `Textarea`,
`Dialog`, `Table`, `FieldLabel`, `Button`, `Badge`, `Alert`, `Checkbox`,
`Switch`, `Select`, `Tooltip`, `Skeleton`, `Spinner`, `Avatar`, `Chip`,
`Accordion`, `Tabs`, `Progress`, `EmptyState`, `Stat`.

There is NO library equivalent for drawer, form, separator, popover, rating,
command, lens, radio-group, pagination or breadcrumb. Leave those imports alone
and report them.

**Do NOT delete or move anything in `frontend/shared/ui/`** even after swapping
a call site away from it. Other agents' files still import those modules.

## Hard rules

- Do NOT edit `packages/theme/**`, `packages/components/**`, `packages/icons/**`,
  `api/**`, or `packages/contracts/**`.
- Do NOT add comments. Do not add "audited" stamps. Remove a comment only if it
  is describing something you changed and is now wrong.
- Do NOT commit and do NOT run `pnpm check`.
- Do NOT change behaviour. This is a styling and import sweep. If a swap would
  change what a control DOES, skip it and report it.
- Never widen or narrow a type to make a swap compile. If it does not fit,
  report it.

## Verify before reporting

```
pnpm --filter @dorado/frontend typecheck
pnpm --filter @dorado/frontend test
```

Both must pass. If your area has render tests, they must still pass.

## Report

Per directory: what you swapped, counts per sweep, anything you left alone and
why, and any raw hex with no token. Be specific.
