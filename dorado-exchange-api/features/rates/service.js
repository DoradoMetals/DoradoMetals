import * as ratesRepo from "#features/rates/repo.js"

export async function getRate(id) {
  return await ratesRepo.getRate(id);
}

export async function getAllRates() {
  return await ratesRepo.getAllRates();
}

export async function getAdminRates() {
  return await ratesRepo.getAdminRates();
}

export async function createRate(rate, user_name) {

  return await ratesRepo.createRate(rate, user_name);
}

export async function updateRate(rate, user_name) {

  return await ratesRepo.updateRate(rate, user_name);
}

export async function deleteRate(id) {
  return await ratesRepo.deleteRate(id);
}
