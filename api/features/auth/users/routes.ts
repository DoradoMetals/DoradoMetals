import { Router } from "express";
import { UsersController } from "./controller";
import { requireAdmin } from "@/shared/middleware/auth";

const router = Router();
const controller = new UsersController();

router.get("/get_user", requireAdmin, controller.getUser);
router.get("/get_all_users", requireAdmin, controller.getAll);
router.get("/get_admin_users", requireAdmin, controller.getAdmins);
router.post("/update_credit", requireAdmin, controller.updateCredit);

export default router;
