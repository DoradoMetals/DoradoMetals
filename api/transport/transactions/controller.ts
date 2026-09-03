import { callerId, requiredParam } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as transactionService from "#domain/transactions/service.ts"

// user_id comes from the SESSION, not the body — this used to read `const { user_id } = req.body` behind requireUser, so a signed-in customer sending one on a GET got somebody else's ledger row (confirmed against dev: 200, with their user_id, transaction_type and purchase_order_id).
// Survived because a GET normally carries no body — every ordinary call (the frontend never calls this at all) passed undefined and got an empty response, so it looked broken rather than dangerous. This is the customer credit ledger: production holds 17 rows across 8 customers, $66,999.32.
// The response shape is left as-is on purpose — the repo returns rows[0] rather than history despite the name (wrong, written up in FOLLOWUPS), but changing a response shape during a schema migration is separate, deliberate work.
export const getTransactionHistory = asyncHandler(async (req, res) => {
  const result = await transactionService.getTransactionHistory(callerId(req));
  return res.status(200).json(result);
});
