import express from "express";
import { listSpots } from "#transport/spots/controller.ts";

const router = express.Router();

// Public, like the catalogue itself: the live metal quotes, plus which way
// each moved today.
router.get("/", listSpots);

export default router;
