import * as transactionRepo from '../repositories/transactionRepo.js';

export async function getTransactionHistory(user_id) {
  return transactionRepo.getTransactionHistory(user_id);
}