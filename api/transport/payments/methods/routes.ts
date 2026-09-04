import express from "express";

import { getMethods } from "#transport/payments/methods/controller.ts";

const router = express.Router();

router.get("/", getMethods);

export default router;
