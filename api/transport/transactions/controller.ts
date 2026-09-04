import { callerId } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as transactionService from "#domain/transactions/service.ts";

// GET /api/transactions - the CALLER'S OWN credit ledger, whole.
//
// user_id comes from the SESSION, not the body. This used to read
// `const { user_id } = req.body` behind requireUser, so a signed-in customer
// sending one on a GET got somebody else's ledger row - confirmed against dev.
// It survived because a GET normally carries no body, so every ordinary call
// passed undefined and got an empty response: it looked broken rather than
// dangerous. This is the customer credit ledger; production holds 17 rows
// across 8 customers, $66,999.32.
//
// It answers the LIST now, not `rows[0]` - see the service.
export const getTransactionHistory = asyncHandler(async (req, res) => {
  return res.status(200).json(await transactionService.history(callerId(req)));
});
