const carriersRepo = require("../repositories/carriersRepo")

async function getAll() {
  return await carriersRepo.getAll()
}

module.exports = {
  getAll,
}