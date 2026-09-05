# Icon migration - one source for every glyph (2026-09-04)

Repo root /home/jtj60/dorado-exchange, branch ds/library-followups.
Work ONLY on the files your prompt assigns.

`@dorado/icons` has been folded into `packages/components/src/icons/`. Every
glyph now comes from `@dorado/components`, and inside the library from a
relative path.

## Where imports point after you are done

| you are editing | import from |
|---|---|
| `packages/components/src/**` | `../icons` (or `./icons`, whatever is correct from that file) |
| `frontend/**` | `@dorado/components` |

Nothing outside the icons folder may import `lucide-react` or
`@phosphor-icons/react` directly when you are finished with your files.

## Lucide files: a rename of the import only

The names are already Lucide names, so only the module specifier changes. Merge
the icons into an existing `@dorado/components` import if the file already has
one rather than adding a second import line.

## Phosphor files: a real conversion

The full map is in `packages/components/src/icons/README.md` - read it. Every
Phosphor name ends in `Icon` and its Lucide counterpart does not, so
`MagnifyingGlassIcon` becomes `Search`, `EnvelopeIcon` becomes `Mail`,
`CaretDownIcon` becomes `ChevronDown`, and so on.

**DO NOT CONVERT THESE THREE.** They have no true Lucide equivalent and Jacob is
choosing them himself. Leave the file's Phosphor import in place for these and
say so in your report:

- `BarbellIcon`
- `CashRegisterIcon`
- `RowsPlusTopIcon`

If a file uses one of those AND other Phosphor icons, convert the others and
leave a Phosphor import carrying only the untouched one.

### Props differ, and this is where the visual regressions hide

- Phosphor takes `weight` ("regular", "bold", "fill", "duotone"). Lucide has no
  weight - it has `strokeWidth`, default 2. Drop `weight` and do not invent a
  `strokeWidth` unless the Phosphor one was explicitly `bold` or `thin`, in
  which case say so in your report rather than guessing a number.
- Phosphor `size={n}` and Lucide `size={n}` both work, so leave those.
- A Phosphor icon with `weight="fill"` was a SOLID glyph. Lucide has no filled
  variant of most icons. Report every one of these - do not silently ship a
  stroked icon where a filled one was.
- `className` and `color` behave the same on both. Leave them.

## If a glyph is not exported yet

`packages/components/src/icons/index.ts` exports a curated list. If your file
needs a name that is not there, ADD it to that file, alphabetically, and verify
the name really exists in lucide-react 0.510 before you do - a name that does
not exist typechecks as a missing export and fails the build. You may edit
`icons/index.ts`. You may NOT edit `packages/components/src/index.ts`.

## Hard rules

- Do NOT add comments.
- Do NOT change any layout, size or colour class around an icon. This is an
  import and name migration.
- Do NOT touch `packages/components/src/index.ts`.
- Do not commit.

## Verify

```
pnpm --filter @dorado/components typecheck
pnpm --filter @dorado/components test
pnpm --filter @dorado/frontend typecheck
pnpm --filter @dorado/frontend test
```

All four must pass.

## Report

Files converted, every name you added to `icons/index.ts`, every `weight="fill"`
you found, every icon you left on Phosphor and why, and any glyph whose Lucide
counterpart you judged a poor match even though the map named one.
