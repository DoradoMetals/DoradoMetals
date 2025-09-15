const usersService = require("../services/usersService");

async function getUser(req, res, next) {
  try {
    const result = await usersService.getUser(req.query.user_id);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function getAll(req, res, next) {
  try {
    const result = await usersService.getAllUsers();
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function getAdmins(req, res, next) {
  try {
    const result = await usersService.getAdminUsers();
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function updateCredit(req, res, next) {
  try {
    const result = await usersService.adjustDoradoCredit(req.body);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getUser,
  getAll,
  getAdmins,
  updateCredit,
};
