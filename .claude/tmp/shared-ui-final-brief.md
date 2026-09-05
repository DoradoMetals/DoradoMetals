# shared/ui final pass - the last 21 modules leave (2026-09-04)

Repo root /home/jtj60/dorado-exchange, branch ds/library-followups.
Work ONLY on the files your prompt assigns. Other agents are live in the tree.

Jacob's rule: shared/ui keeps CreateDialog, SidebarLayout, GoogleMapDisplay and
the library owns everything else. "Stuff like that is quite simply UI that is
either going away or will need to be updated anyway. Doesn't need to be kept."
So: minimal WORKING replacements on the library components, not faithful ports
of the old look.

## Hard rules
- NO comments in any file.
- Do not edit packages/components/src/index.ts (report exports you need).
  You MAY add files under packages/components/src/ where your prompt says so.
- Delete a shared/ui module only when a grep shows zero importers, any quote
  style, any relative path. Convert call sites first, delete last.
- If a file you need is named in ANOTHER agent's ownership list in your prompt,
  do not touch it - report what it needs.
- Do not commit.

## Verify, all four must pass
pnpm --filter @dorado/components typecheck
pnpm --filter @dorado/components test
pnpm --filter @dorado/frontend typecheck
pnpm --filter @dorado/frontend test

## Report
Files converted, modules deleted, anything left because a library gap made it
impossible, and every visible change a user would notice.
