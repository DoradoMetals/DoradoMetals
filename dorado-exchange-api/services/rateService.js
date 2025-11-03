import * as  ratesRepo from "../repositories/ratesRepo.js"

export async function getRates() {
  return await ratesRepo.getRates()
}
