import * as payoutBracketService from "../services/payoutBracketService.js";

export async function getPayoutBrackets(req, res, next) {
  try {
    const brackets = await payoutBracketService.getPayoutBrackets(req.body);
    res.json(brackets);
  } catch (err) {
    return next(err);
  }
}
