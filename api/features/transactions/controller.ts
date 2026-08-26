import { callerId, requiredParam } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as transactionService from "#features/transactions/service.ts"

// USER_ID COMES FROM THE SESSION, NOT THE BODY.
//
// This read `const { user_id } = req.body` behind requireUser, and the repo
// scopes on whatever it was given. So a signed-in customer sending
//
//   GET /api/transactions/get_transactions
//   Content-Type: application/json
//   {"user_id": "<somebody else>"}
//
// received that person's account_transactions row - 200, with their user_id,
// transaction_type and purchase_order_id. Confirmed against dev before fixing,
// not inferred: one customer read another's ledger entry.
//
// It looked inert, and that is why it survived. A GET normally carries no body,
// so every ordinary call - including the frontend's, which does not call this
// at all - passed user_id as undefined and got an empty response back. The
// endpoint appeared broken rather than dangerous. Any HTTP client that will put
// a body on a GET turns one into the other.
//
// This is the customer credit ledger: production holds 17 rows across 8
// customers, $66,999.32.
//
// The shape is left exactly as it was. The repo returns rows[0] rather than a
// history despite the name, which is wrong and is written up in FOLLOWUPS, but
// nothing calls this endpoint and changing a response shape during a schema
// migration is separate, deliberate work.
export const getTransactionHistory = asyncHandler(async (req, res) => {
  const result = await transactionService.getTransactionHistory(callerId(req));
  return res.status(200).json(result);
});
