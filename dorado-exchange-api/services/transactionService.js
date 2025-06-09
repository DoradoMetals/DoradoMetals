const transactionRepo = require("../repositories/transactionRepo");

async function getTransactionHistory(user_id) {
  return transactionRepo.getTransactionHistory(user_id)
}

module.exports = {
  getTransactionHistory
}