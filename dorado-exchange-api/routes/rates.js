import express from "express";
import { getRates } from "../controllers/rateController.js";

const router = express.Router();

router.get("/get_rates", getRates);

export default router;
