import * as usersRepo from "#features/users/repo.js"

export async function getUser(id) {
  return await usersRepo.getUser(id);
}

export async function getAllUsers() {
  return await usersRepo.getAllUsers();
}

export async function getAdminUsers() {
  return await usersRepo.getAdminUsers();
}

export async function adjustDoradoCredit({user_id, mode, amount}) {
  return await usersRepo.adjustUserCredit(user_id, mode, amount)
}
