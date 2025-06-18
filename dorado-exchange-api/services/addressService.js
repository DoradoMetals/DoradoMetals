const addressRepo = require("../repositories/addressRepo");

async function getAddressFromId(id) {
  return await addressRepo.getAddressFromId(id);
}

module.exports = {
  getAddressFromId,
};
