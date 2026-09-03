# Figma component audit brief (2026-09-03)

You are auditing components in `packages/components/src/` against their drawings
in the Figma library, and FIXING the drift you find. Work only on the components
assigned to you in your task prompt.

Figma file key: `8A73quhBLBqotJlX95jN9j`  ("Themes and Components")

## Procedure, per assigned component

1. **MANDATORY FIRST**, once per session, before any `get_design_context` call:
   read the skill with
   `ReadMcpResourceTool(server="figma", uri="skill://figma/figma-design-to-code/SKILL.md")`
   and follow its gate protocol (G1, G2-G4, G5).

2. Call `mcp__figma__get_design_context` with the fileKey above, the component's
   `nodeId`, `clientFrameworks: "react"`, `clientLanguages: "typescript"`,
   `skillNames: "resource:figma-design-to-code"`.
   Read the **component description** that comes back - it is the contract, and
   it usually states the design rules in words. It outranks your reading of the
   rendered code.

3. Call `mcp__figma__get_variable_defs` on the same node and copy the returned
   token map verbatim into your final report. The orchestrator uses these to
   reconcile `packages/theme`.

4. Diff the drawing against the existing `.tsx`. Fix what genuinely drifted.
   If the component already matches, say CLEAN and change nothing.

## Hard rules

- **Do NOT edit `packages/theme/**`.** If the drawing needs a token that does
  not exist, or an existing token's value is wrong, REPORT it with the exact
  value and do not work around it with an arbitrary Tailwind value.
- **Do NOT edit `packages/components/src/index.ts`.** Report any export change.
- **Do NOT edit anything under `frontend/`, `api/`, or `packages/contracts/`.**
- **Do NOT run `pnpm check`, do not commit, do not touch any `.env`.**
- **Tokens, not magic numbers.** Use the theme's utilities: `text-display`,
  `text-h1..h6`, `text-body`, `text-small`, `text-micro`, `text-stat`,
  `rounded-sm/md/lg`, `bg-*`/`text-*`/`border-*` semantic colors, and the named
  spacing steps. An arbitrary value like `text-[17px]` is a bug unless you have
  reported why no token fits.
- **Preserve the hallmarks the drawing cannot express**: `focus-visible` rings,
  keyboard handling, aria attributes, `motion-reduce`, the `cn()` merge, the
  cva structure, and the `'use client'` directive where one is present. A
  drawing showing no focus ring is not permission to delete one.
- **The call-site rule**: layout (flex placement, gap between siblings, margin,
  `w-full`) belongs to call sites; appearance (color, type, border, radius,
  hover) belongs to the component.
- **Prop APIs**: keep the public API unless the drawing genuinely demands a
  change. If it must change, update that component's own tests and REPORT the
  change clearly - frontend call sites are the orchestrator's to fix, not yours.
- If a component has no node id, find it with
  `mcp__figma__search_design_system` (`entity: "component"`, the component's
  name). If you still cannot find it, report that and leave the file untouched.

## Finishing each file

- Update the file's header comment in the voice it already uses: cite the node
  id, add `audited 2026-09-03`, and state what changed and why. Do not delete
  the existing design rationale - amend it.
- Update or extend the component's tests in the same directory so the new
  behaviour is pinned.

## Before you report

Run both, from the repo root, and make them pass:

```
pnpm --filter @dorado/components typecheck
pnpm --filter @dorado/components test
```

## Report format

For each assigned component:

- `<name>` - **CLEAN** or **FIXED**
- what the drawing specified that the code did not do (be concrete: sizes,
  colors, spacing, states)
- what you changed
- the `get_variable_defs` token map, verbatim
- anything the orchestrator must action (theme token, index.ts export, frontend
  call-site breakage)
