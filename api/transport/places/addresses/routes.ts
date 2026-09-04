// REST (D214 item 4): the verb is the METHOD and the address is named once, in
// the path. `/get`, `/create`, `/update`, `/delete` and `/set_default` are
// gone; `?user_id=` is how an admin says whose book, on every one of them.
import express from "express";

import {
  list, getOne, create, update, remove, setDefault, suggest, lookup,
} from "#transport/places/addresses/controller.ts";
import { requireUser } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

// Declared before /:id so "suggestions" is never read as an address id.
router.get("/suggestions", requireUser, suggest);
router.get("/suggestions/:place_id", requireUser, lookup);

router.get("/", requireUser, list);
router.post("/", requireUser, create);
router.get("/:id", requireUser, getOne);
router.patch("/:id", requireUser, update);
router.delete("/:id", requireUser, remove);
router.post("/:id/default", requireUser, setDefault);

export default router;
