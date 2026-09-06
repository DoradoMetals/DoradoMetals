# API review brief (2026-09-07)

Jacob: "Could we scour the API and make sure it's simple and correct? I'm
sure we can find some things that are 'wrong'."

You are a reviewer, not a fixer. You change NO code. You write ONE findings
document for your area and nothing else. Read CLAUDE.md, AGENTS.md, and
FOLLOWUPS.md's two "Jacob's rulings" sections (47-84) first: they are the law
the code must obey, and a ruling broken is a finding.

## What "wrong" means here, in priority order

1. **Money or weight is computed wrong.** Rounding, unit, purity, direction
   (purchase vs sale), premium source (rates for purchases, ask_premium for
   sales), spot frozen vs live, credit applied twice or never, fee on the
   wrong base, tax on the wrong lines. Trace the SQL; do not trust a name.
2. **A write that can lose or corrupt a row.** Side effects inside a
   transaction (email, Stripe, FedEx before commit), missing `FOR UPDATE`
   where two requests race, a `tx` not passed so a write escapes the caller's
   transaction, an UPDATE whose WHERE can match zero rows silently, an
   idempotency gap on a webhook or a retry, an `exchange` write of any kind.
3. **Authorization.** A customer reaching another customer's row, an admin
   check missing, an ownership check that trusts the body, bank details or
   secrets on the wire or in a log.
4. **A rule that lies.** A status or step derived from the wrong fact,
   `missing()` that can never be empty or is empty too early, a guard that
   checks the old column, dead branches that still decide something.
5. **Contract drift.** A view whose SQL emits fields the contract does not
   declare or vice versa, a nullable column typed required, a parse at the
   wrong boundary.
6. **Complexity that hides bugs.** Two functions doing the same thing
   differently, a service that re-spells columns, an abstraction with one
   caller, a `rules.ts` that is really a service, anything a reader must
   simulate to understand.

## What is NOT a finding

Style, naming, comments, formatting, anything the lints already enforce and
pass, the frontend, ruling 13 URL shapes, "could add a test" without a
concrete failure it would catch, anything already listed as an open item in
FOLLOWUPS.md's latest sections (check before reporting).

## How to work

- Read every non-test file in your area, and the tests that pin its numbers.
- For every suspected finding, PROVE it: quote the lines, state the input
  that triggers it and the wrong output, and where possible run it - the
  test harness, `psql` against the local test database, or a script against
  the local rebuilt production copy `chain6` on 127.0.0.1:5544 (read only;
  never print customer rows). A finding you could not reproduce says so.
- Never touch the dev or production databases with writes; never
  PROD_READONLY_DATABASE_URL.
- Redirect command output to files under the scratchpad and grep them.

## The document

`docs/reviews/<area>.md`, in this shape, terse:

```
# <area> review

## Findings (most severe first)
### F1 <one-line claim>  [severity: money|data|authz|rule|contract|complexity]
- where: path:line
- proof: the lines, the input, the wrong output, how reproduced
- fix: one or two sentences, what the correct behaviour is and where it lives
### F2 ...

## Verified correct (things you suspected and disproved, one line each)

## Simplifications (complexity findings that are not bugs, one line each with the file)
```

Aim for precision over volume. Ten proven findings beat forty guesses.
