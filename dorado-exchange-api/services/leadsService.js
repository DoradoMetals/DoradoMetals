const leadsRepo = require("../repositories/leadsRepo");

async function getLead(id) {
  return await leadsRepo.getLead(id);
}

async function getAllLeads() {
  return await leadsRepo.getAllLeads();
}

async function createLead(lead) {
  return await leadsRepo.createLead(lead)
}

async function updateLead(lead, user_name) {
  return await leadsRepo.updateLead(lead, user_name)
}
async function deleteLead(id) {
  return leadsRepo.deleteLead(id);
}

module.exports = {
  getLead,
  getAllLeads,
  createLead,
  updateLead,
  deleteLead,
};
