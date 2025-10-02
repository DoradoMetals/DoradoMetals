import * as  payoutBracketRepo from "../repositories/payoutBracketRepo.js"

export async function getPayoutBrackets() {
  return await payoutBracketRepo.getPayoutBrackets()
}
