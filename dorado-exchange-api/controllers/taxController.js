const taxService = require("../services/taxService");

async function getSalesTax(req, res, next) {
  try {
    const tax = await taxService.getSalesTax(req.body);
    return res.json(tax);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getSalesTax,
};
