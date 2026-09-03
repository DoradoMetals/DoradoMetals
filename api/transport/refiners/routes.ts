import express from "express";

import { getAllRefiners } from "#transport/refiners/controller.ts";

import { requireAdmin } from "#shared/middleware/authMiddleware.ts";
const router = express.Router();

// NO WIRE ADAPTER. Refiners converted 2026-08-27, the same lift as carriers
// with different nouns: the frontend reads the nested organization from
// @dorado/contracts, so the flatten is gone. Addresses still carries its
// lift until it converts.

router.get("/get_all", requireAdmin, getAllRefiners);

export default router;
