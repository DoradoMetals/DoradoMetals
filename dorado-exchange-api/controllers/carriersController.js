const carriersService = require("../services/carriersService");

async function getAll(req, res, next) {
  try {
    const result = await carriersService.getAll();
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getAll,
};
