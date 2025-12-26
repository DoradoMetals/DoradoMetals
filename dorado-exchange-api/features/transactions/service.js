import * as transactionRepo from "#features/transactions/repo.js"

export async function getTransactionHistory(user_id) {
  return transactionRepo.getTransactionHistory(user_id);
}