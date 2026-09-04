import withTransaction from "#shared/db/withTransaction.ts";
import { payouts as payoutsRepo } from "#db";
import {
  paymentDetails as payoutDetails, orderTransactions,
} from "#domain";
import {
  assertNamesAField, assertPayout, assertWaivable, assertWritablePayout,
} from "#domain/payouts/rules.ts";
import type { Payout, PayoutDetails, PayoutPatch } from "@dorado/contracts";

export async function patchPayout(
  payout_id: string, patch: PayoutPatch
): Promise<Payout> {
  assertNamesAField(patch);

  return await withTransaction(async (tx) => {
    const order_id = assertWritablePayout(
      payout_id, await payoutsRepo.getById(payout_id, tx)
    );

    if (patch.cost !== undefined) {
      await orderTransactions.update(order_id, { payout_fee: patch.cost }, {}, tx);
    }

    if (patch.method !== undefined) {
      await payoutDetails.setMethod(payout_id, patch.method, tx);
    }

    if (patch.waive_payout_fee !== undefined) {
      const written = await orderTransactions.update(
        order_id,
        { waive_payout_fee: patch.waive_payout_fee },
        { direction: "purchase" },
        tx
      );
      assertWaivable(payout_id, written);
    }

    return assertPayout(payout_id, await payoutsRepo.getById(payout_id, tx));
  });
}

export async function getPayoutsByOrder(order_id: string): Promise<Payout[]> {
  return await payoutsRepo.getMany([order_id]);
}

export async function getDetails(id: string): Promise<PayoutDetails | undefined> {
  const payout = await payoutsRepo.getById(id);
  if (!payout) return undefined;
  return Object.assign(payout, await payoutDetails.decryptFor(id));
}
