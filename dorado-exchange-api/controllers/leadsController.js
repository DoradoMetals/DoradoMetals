const leadsService = require("../services/leadsService")

async function getOne(req, res, next) {
  try {
    const lead = await leadsService.getLead(req.query.lead_id);
    return res.status(200).json(lead);
  } catch (err) {
    return next(err);
  }
}

async function getAll(req, res, next) {
  try {
    const leads = await leadsService.getAllLeads();
    return res.status(200).json(leads);
  } catch (err) {
    return next(err);
  }
}

async function createLead(req, res, next) {
  try {
    const lead = await leadsService.createLead(req.body.lead);
    return res.status(200).json(lead);
  } catch (err) {
    return next(err);
  }
}

async function updateLead(req, res, next) {
  try {
    const lead = await leadsService.updateLead(req.body.lead, req.body.user_name);
    return res.status(200).json(lead);
  } catch (err) {
    return next(err);
  }
}

async function deleteLead(req, res, next) {
  try {
    const lead = await leadsService.deleteLead(req.body.lead_id,);
    return res.status(200).json(lead);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getOne,
  getAll,
  createLead,
  updateLead,
  deleteLead,
};
