import * as usersService from "#features/users/service.js"

export async function getUser(req, res, next) {
  try {
    const result = await usersService.getUser(req.query.user_id);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getAll(req, res, next) {
  try {
    const result = await usersService.getAllUsers();
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getAdmins(req, res, next) {
  try {
    const result = await usersService.getAdminUsers();
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function updateCredit(req, res, next) {
  try {
    const result = await usersService.adjustDoradoCredit(req.body);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}