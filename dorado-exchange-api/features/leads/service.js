import * as  leadsRepo from "#features/leads/repo.js"

export async function getLead(id) {
  return await leadsRepo.getLead(id);
}

export async function getAllLeads() {
  return await leadsRepo.getAllLeads();
}

export async function createLead(lead) {
  return await leadsRepo.createLead(lead)
}

export async function updateLead(lead, user_name) {
  return await leadsRepo.updateLead(lead, user_name)
}

export async function deleteLead(id) {
  return leadsRepo.deleteLead(id);
}
