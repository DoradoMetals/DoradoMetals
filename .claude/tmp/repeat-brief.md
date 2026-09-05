# Frontend repeated-code pass, 2026-09-04. Repo /home/jtj60/dorado-exchange, branch ds/library-followups.

Jacob: "start looking at the frontend and try to make shit better... there's probably a ton of repeated code."
A read-only survey ranked the duplication; your prompt gives you a slice of it. Other agents are live in
frontend/features/navigation/**, frontend/features/spots/** and packages/components/** - never touch those.

## Hard rules
- NO comments in any file. Strip pre-existing comments from any file you edit.
- No text-styling utilities; semantic HTML + typography.css (h1-h6, p, small, strong, .micro, .eyebrow, data-emphasis).
- Use @dorado/components for every UI primitive; icons from @dorado/icons; data hooks from @dorado/client.
- A shared thing goes where its consumers meet: features/orders/ui/ for orders-wide, frontend/shared/hooks/ for hooks.
  frontend/shared/ui/ is CLOSED (Jacob's rule: only CreateDialog, SidebarLayout, GoogleMapDisplay live there).
- Consolidate by extracting the SHARED SHAPE and parameterising the difference; never merge two things whose logic
  differs (the survey flagged the order drawer footers' totals math as genuinely different - leave it).
- Behaviour-preserving unless your prompt names a visible change. List every visible change in your report.
- Do not commit. Do not touch api/.

## Verify - both must pass
pnpm --filter @dorado/frontend typecheck
pnpm --filter @dorado/frontend test

## Report: files added/changed/deleted, lines removed (git diff --stat), visible changes, anything left and why.
