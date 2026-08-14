import { Router } from "express";
import * as controller from "./registerSession.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { closeRegisterSchema, currentRegisterQuerySchema, listRegisterQuerySchema, openRegisterSchema } from "./registerSession.validators";

const router = Router();
router.use(authenticate, requirePermission("pos.access"));

router.get("/current", validate(currentRegisterQuerySchema, "query"), controller.current);
router.get("/", requirePermission("pos.register.manage"), validate(listRegisterQuerySchema, "query"), controller.list);
router.post("/open", requirePermission("pos.register.manage"), validate(openRegisterSchema), controller.open);
router.post("/:id/close", requirePermission("pos.register.manage"), validate(closeRegisterSchema), controller.close);
router.get("/:id/ledger", requirePermission("pos.register.manage"), controller.ledger);

export default router;
