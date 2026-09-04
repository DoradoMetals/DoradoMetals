import express from "express";
import { listSpots } from "#transport/spots/controller.ts";

const router = express.Router();

router.get("/", listSpots);

export default router;
