import * as leadsService from "../services/leadsService.js";

export async function getOne(req, res, next) {
  try {
    const lead = await leadsService.getLead(req.query.lead_id);
    return res.status(200).json(lead);
  } catch (err) {
    return next(err);
  }
}

export async function getAll(req, res, next) {
  try {
    const leads = await leadsService.getAllLeads();
    return res.status(200).json(leads);
  } catch (err) {
    return next(err);
  }
}

export async function createLead(req, res, next) {
  try {
    const lead = await leadsService.createLead(req.body.lead);
    return res.status(200).json(lead);
  } catch (err) {
    return next(err);
  }
}

export async function updateLead(req, res, next) {
  try {
    const lead = await leadsService.updateLead(req.body.lead, req.body.user_name);
    return res.status(200).json(lead);
  } catch (err) {
    return next(err);
  }
}

export async function deleteLead(req, res, next) {
  try {
    const lead = await leadsService.deleteLead(req.body.lead_id,);
    return res.status(200).json(lead);
  } catch (err) {
    return next(err);
  }
}
