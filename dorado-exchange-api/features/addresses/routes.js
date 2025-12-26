import express from "express";
import { requireAuth } from "../../middleware/authMiddleware.js";
import { getAll, create, update, remove, setDefault } from "./controller.js";

const router = express.Router();

router.get("/get", requireAuth, getAll);
router.post("/create", requireAuth, create);
router.post("/update", requireAuth, update);
router.delete("/delete", requireAuth, remove);
router.post("/set_default", requireAuth, setDefault);

export default router;
