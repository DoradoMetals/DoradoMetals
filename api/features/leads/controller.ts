import { callerId, requiredParam } from "#shared/http/caller.ts";
import { oneString } from "#shared/http/query.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as leadsService from "#features/leads/service.ts"

export const getOne = asyncHandler(async (req, res) => {
  const lead = await leadsService.getLead(requiredParam(req.query.lead_id, "lead_id"));
  return res.status(200).json(lead);
});

export const getAll = asyncHandler(async (req, res) => {
  const leads = await leadsService.getAllLeads();
  return res.status(200).json(leads);
});

export const createLead = asyncHandler(async (req, res) => {
  const lead = await leadsService.createLead(req.body.lead);
  return res.status(200).json(lead);
});

export const updateLead = asyncHandler(async (req, res) => {
  const lead = await leadsService.updateLead(req.body.lead, req.body.user_name);
  return res.status(200).json(lead);
});

export const deleteLead = asyncHandler(async (req, res) => {
  const lead = await leadsService.deleteLead(req.body.lead_id);
  return res.status(200).json(lead);
});
