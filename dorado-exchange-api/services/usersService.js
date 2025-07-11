const usersRepo = require("../repositories/usersRepo");

async function getUser(id) {
  return await usersRepo.getUser(id);
}

async function getAllUsers() {
  return await usersRepo.getAllUsers();
}

async function adjustDoradoCredit({user_id, mode, amount}) {
  return await usersRepo.adjustUserCredit(user_id, mode, amount)
}

module.exports = {
  getUser,
  getAllUsers,
  adjustDoradoCredit,
};
