# Roles and assignment (rulings 155, 156)

Owners see everything. An employee sees only what is assigned to them. New
work is auto-assigned by rules an owner configures. Written 2026-10-16; the
lane runs test-first under ruling 153.

## What exists today

- One ladder in `api/src/shared/middleware/authMiddleware.ts`: `user` (1),
  `verified_user` (2), `admin` (3). `requireAdmin` guards 212 routes,
  `requireUser` 62, `requireOwnOrder*` 15. Dev holds 75 `user`, 3 `admin`.
- `auth.employees (user_id, role, enabled)` exists, 2 rows on dev, read by
  nothing.
- `assigned_to_id` exists on `auth.users`, `leads.leads`, `orders.orders`,
  `refining.orders`, and `crm.assignments (user_id, lead_id, assigned_to_id,
  assigned_at)` records lead and customer assignments through
  `domains/crm/assignments/service.ts` `record`.
- `db/orders/sql/list.sql` and `db/leads/sql/get_all.sql` take
  `assigned_to_id` as an optional admin filter. The orders controller lets an
  admin choose it; it is never forced.
- 59 `isAdmin` / `role === 'admin'` checks across 12 domain files decide view
  shape and permissions.

## The model

- Roles: `user` < `verified_user` < `employee` < `owner`. `admin` becomes
  `owner`. Guards: `requireEmployee` replaces `requireAdmin` everywhere;
  `requireOwner` guards the owner-only set below. `isAdmin` becomes
  `isStaff`; a new `isOwner` where the owner-only set needs it in a view.
- Viewer scoping: every staff list repo call takes `viewer: { id, role }`
  and passes `$viewer_id` into SQL; the statement applies
  `AND ($viewer_id IS NULL OR assigned_to_id = $viewer_id)` with `NULL` for an
  owner. Rows reached through a parent (lots, documents, notes, activity,
  transactions, messages, calls) filter on the parent's `assigned_to_id`.
  A single-row read of something not assigned to the employee is refused
  by `rules.ts` with 403 (`NotAssigned`).
- Owner-only endpoints: assign and reassign (every subject), employees
  (list, enable, disable, role), assignment rules, the bank reveal, pricing
  configuration (rates, adjustments, methods), user role changes.
- Auto-assign: `crm.assignment_rules (id, subject_kind, strategy,
  enabled, …)` with `subject_kind in ('lead','order','customer')`, `strategy
  in ('round_robin','least_open','fixed')`, and
  `crm.assignment_rule_members (rule_id, employee_user_id, weight)`. The
  owning service (`leads`, `orders`, `accounts`) calls
  `crm.assignments.autoAssign(kind, subject_id, tx)` after the insert, in the
  same transaction; it picks by strategy, writes `assigned_to_id` through the
  owning repo, and records a `crm.assignments` row with `rule_id`. Manual
  assignment goes through the same service with `rule_id` null.
  `crm.assignments` gains `order_id`, `refining_order_id`, `rule_id`
  (nullable, one subject per row, CHECK).
- Migrations: 296 `auth.users.role` `admin` → `owner` (data, in `migrate`
  order; read-only count on production first), CHECK on the role set; 297
  `crm.assignment_rules` and members; 298 `crm.assignments` subject columns
  and `rule_id`.

## Tests first (ruling 153)

The test agent writes these before any implementation and proves each fails:

1. HTTP: an employee listing orders, refiner orders, leads and customers
   receives only rows assigned to them; an owner receives all, including
   unassigned.
2. HTTP: an employee reading an order, lead or customer not assigned to them
   gets 403; one assigned, 200; their lots, documents, notes and activity
   follow the parent.
3. HTTP: every owner-only endpoint returns 403 to an employee.
4. Service: `autoAssign` round robin rotates over enabled members; least_open
   picks the member with the fewest open subjects of that kind; fixed picks
   the one member; a disabled rule assigns nothing; every assignment writes
   `crm.assignments` with the actor id and rule id.
5. Service: creating a lead, an order and a customer with an enabled rule
   leaves them assigned; reassign by an owner writes a new row.
6. Migration 296 replay: no `admin` remains; `verify:replay` green.
7. Contracts: `Role`, `AssignmentRule`, `AssignmentRuleMember` composed from
   generated rows; `lint:contracts-derived` green.

## Frontend (after Figma)

- People > Employees list: Auto-assign drawer (strategy per kind). Employee
  screen 37:2092 with Viewer=Owner | Employee (ruling 156): the view's
  `actions` decide what the Entity Header renders.
- Admin "Assigned to" filter: owner chooses, employee fixed to self.
- Admin Uncontacted leads card: owner sees all with Assign/Reassign, employee
  sees theirs with Contact.
- Playwright: one spec per viewer for the employee screen and the leads card.

## Open for Jacob

- 403 or 404 for an unassigned read by an employee (spec says 403).
- Does a customer inherit the assignee of their first order or lead, or is a
  customer assigned on their own? Spec: on their own, by the customer rule.
- Owner-only set above: anything to add or remove.
