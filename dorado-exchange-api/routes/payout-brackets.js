import express from "express";
import { getPayoutBrackets } from "../controllers/payoutBracketController.js";

const router = express.Router();

router.get("/get_payout_brackets", getPayoutBrackets);

export default router;
