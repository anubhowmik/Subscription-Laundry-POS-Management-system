import { Router } from "express";
import * as controller from "./unit.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createUnitSchema, listUnitQuerySchema, updateUnitSchema } from "./unit.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry"));

router.get("/", requirePermission("units.view"), validate(listUnitQuerySchema, "query"), controller.list);
router.get("/:id", requirePermission("units.view"), controller.getById);
router.post("/", requirePermission("units.create"), validate(createUnitSchema), controller.create);
router.put("/:id", requirePermission("units.update"), validate(updateUnitSchema), controller.update);
router.delete("/:id", requirePermission("units.delete"), controller.deactivate);

export default router;
