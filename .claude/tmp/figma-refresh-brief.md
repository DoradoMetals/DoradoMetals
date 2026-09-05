# Figma refresh lanes, 2026-09-04 - "go update all our components with the figma changes"

Read /home/jtj60/dorado-exchange/.claude/tmp/ds-lane-brief.md first; its rules apply here.

Figma file key: 8A73quhBLBqotJlX95jN9j. Before your FIRST get_design_context call, read the MCP resource
skill://figma/figma-design-to-code/SKILL.md (ReadMcpResourceTool, server "figma") and pass
skillNames "resource:figma-design-to-code" on every get_design_context call. Use excludeScreenshot: true
except when a layout question needs the picture. The desktop page listing is unreliable; the node ids below resolve.

## For EACH component in your list
1. get_design_context on the node. Read the COMPONENT DESCRIPTION in the response first - it is the
   contract and carries dated REVISED/FIXED notes from Jacob. The drawing is evidence for geometry and tokens.
2. Open the code component in packages/components/src/<name>/. Compare: variants/axes, sizes, tokens
   (colours, radii, spacing, borders), typography tags, states (hover/disabled/focus), icons and their sizes,
   descriptions' rules (e.g. Button: hover is opacity 85%, tertiary px-0, icon gap 4/5/6 by size, disabled opacity 50%).
3. Fix drift in the code so it matches the drawing + description. Do not add props the description does not
   ask for; do not remove accessibility hallmarks the drawing cannot show.
4. Update or add tests for what you changed (colocated *.test.tsx, axe via ../test/axe).
5. If the Figma component has NO code counterpart, do not build it - list it in your report with its node id and
   a one-line description of what it is.
6. If the drawing is broken or contradicts its own description, do not guess - report it.

Update the node table in packages/components/README.md for any id you find wrong. No comments in code.
Do not edit packages/components/src/index.ts. Do not touch frontend/. Do not commit.

## Verify before reporting
pnpm --filter @dorado/components typecheck
pnpm --filter @dorado/components test

## Report, per component: node id, "no drift" or a list of what changed, and the not-built list.
