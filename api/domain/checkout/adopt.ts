// SIGNING IN KEEPS THE BASKET (ruling 63).
//
// A visitor shops under an anonymous better-auth user (domain/auth/client.ts).
// When they sign in or sign up, better-auth's anonymous plugin calls
// `onLinkAccount` with both identities, and this is what it calls: the
// visitor's checkout rows - and, with them, their basket lines and the
// addresses they typed - become the real customer's.
//
// IT IS NOT A COPY. The visitor's row is RE-KEYED where the customer has no
// row for that direction, which moves the lines, the choices and the row's own
// id in one UPDATE and leaves nothing behind to sweep. Only when the customer
// already has a row for that direction does anything merge, and rules.ts
// `mergeChoices` is the whole of that decision.
//
// WHAT IT DELIBERATELY DOES NOT MOVE: payouts and orders, because a visitor
// can have neither - domain/checkout/service.ts refuses the payout step for an
// anonymous subject and domain/orders/place.ts refuses the placement, so bank
// details and money never belong to a throwaway identity in the first place.
//
// IT NEVER THROWS AT THE CALLER. `onLinkAccount` runs inside better-auth's
// sign-in response hook: an exception there is a customer who cannot sign in.
// A basket is device-sync, not a ledger (CLAUDE.md), so a failed adoption is
// reported and the sign-in proceeds - the customer loses a basket they can
// rebuild, rather than an account they cannot get into.
import { checkouts, checkoutItems, userAddresses } from "#db";
import withTransaction from "#shared/db/withTransaction.ts";
import * as rules from "#domain/checkout/rules.ts";
import { attempt } from "#shared/attempt.ts";
import type { Executor } from "#shared/db/executor.ts";

export type Adoption = {
  direction: string;
  outcome: "moved" | "merged";
  checkout_id: string;
  /** Lines of the customer's OWN basket that the visitor's replaced. Zero on a
   *  "moved" adoption (there was no basket to replace) and usually zero on a
   *  merge; a non-zero number is a customer who had a basket on this account
   *  and is now looking at the visitor's, which is the merge rule working. */
  replaced: number;
};

export type AdoptionResult = {
  /** Named `adopted` rather than `checkouts` on purpose: `result.checkouts.map`
   *  reads to lint:namespace-calls as a call on the `checkouts` REPO, which
   *  exports no `map`. A field name that makes a linter lie about a caller is
   *  the field name's problem. */
  adopted: Adoption[];
  addresses: number;
};

// The one door, and the shape better-auth's hook hands us: two user ids.
export async function adoptAnonymousCheckout(
  { anonymousUserId, userId }: { anonymousUserId: string; userId: string },
  executor?: Executor
): Promise<AdoptionResult> {
  // Linking a user to itself is not a merge; it is a no-op, and better-auth's
  // own hook already treats that case as "nothing happened".
  if (!anonymousUserId || !userId || anonymousUserId === userId) {
    return { adopted: [], addresses: 0 };
  }
  const run = (client: Executor) => adopt(anonymousUserId, userId, client);
  return executor ? await run(executor) : await withTransaction(run);
}

// The same call, best-effort - what better-auth's `onLinkAccount` mounts.
// `attempt` is the one sanctioned exception to the no-try rule
// (shared/attempt.ts, and lint:one-catch enforces the rest): it logs once and
// answers undefined, which is exactly the trade here - a basket is device-sync
// and can be rebuilt, a sign-in that throws is a customer locked out. Separate
// from the function above so a test, a script or a future caller still sees
// the error.
export const adoptAnonymousCheckoutQuietly = (
  ids: { anonymousUserId: string; userId: string }
): Promise<AdoptionResult | undefined> =>
  attempt("carry a visitor's basket onto their new account", () =>
    adoptAnonymousCheckout(ids)
  );

async function adopt(
  anonymousUserId: string, userId: string, client: Executor
): Promise<AdoptionResult> {
  // BOTH SIDES MOVE, SO THE KEY BETWEEN THEM WAITS FOR THE COMMIT. The address
  // book and the checkout rows that point at it are only consistent together
  // (migration 126, and checkouts.deferAddressOwnership carries the reasoning);
  // this is the only caller that asks for it, and it lasts one transaction.
  await checkouts.deferAddressOwnership(client);

  // THE ADDRESS BOOK FIRST. A visitor's checkout row points at addresses the
  // visitor entered, and patchCheckout refuses an address that is not in the
  // caller's book - so a checkout that moved without its addresses would be a
  // row the customer cannot edit. Re-keying the LINK moves the address into the
  // customer's book; the address row itself is shared and is not re-keyed.
  const addresses = await userAddresses.reassign(anonymousUserId, userId, client);

  const moved: Adoption[] = [];
  for (const visitor of await checkouts.listFor(anonymousUserId, client)) {
    const mine = await checkouts.findFor(userId, visitor.direction, client);

    if (!mine) {
      // NOTHING TO MERGE WITH: the row itself changes hands, lines and all.
      // The answer is checked rather than discarded - a re-key that matched no
      // row would silently leave the basket with the visitor, and a zero-row
      // UPDATE does not raise (audit:silent-mutations).
      const rekeyed = await checkouts.reassign(visitor.id, userId, client);
      rules.assertRekeyed(rekeyed, visitor.id, userId);
      moved.push({
        direction: visitor.direction, outcome: "moved",
        checkout_id: visitor.id, replaced: 0,
      });
      continue;
    }

    // TWO ROWS, ONE SURVIVOR. The customer's row survives - it is the one every
    // other reference already points at - and takes the visitor's choices where
    // the visitor made one (rules.mergeChoices) and the visitor's basket
    // outright.
    const patch = rules.mergeChoices(visitor, mine);
    if (Object.keys(patch).length > 0) await checkouts.update(mine.id, patch, client);

    let replaced = 0;
    const lines = await checkoutItems.listFor(visitor.id, client);
    if (lines.length > 0) {
      // Both counts are read rather than discarded. `carried` MUST equal what
      // was there - a reassign that moved nothing would leave the customer
      // looking at their old basket with the visitor's silently dropped, and a
      // zero-row UPDATE does not raise (audit:silent-mutations). `replaced` is
      // reported, because "your basket was replaced" is the one surprising
      // thing this function can do to a customer.
      replaced = await checkoutItems.removeFor(mine.id, client);
      const carried = await checkoutItems.reassign(visitor.id, mine.id, client);
      rules.assertLinesCarried(carried, lines.length, visitor.id);
    }

    // The emptied visitor row goes, so the sweep has nothing to find and the
    // (user_id, direction) unique index cannot be hit twice.
    const removed = await checkouts.remove(visitor.id, client);
    rules.assertVisitorRowGone(removed, visitor.id, mine.id);
    moved.push({
      direction: visitor.direction, outcome: "merged",
      checkout_id: mine.id, replaced,
    });
  }

  return { adopted: moved, addresses };
}
