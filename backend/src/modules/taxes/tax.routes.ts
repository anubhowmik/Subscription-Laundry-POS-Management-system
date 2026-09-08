import { Router } from "express";
import * as controller from "./tax.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createTaxSchema, listTaxQuerySchema, updateTaxSchema } from "./tax.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry", "app.pos_service", "app.pos_product"));

router.get("/", requirePermission("taxes.view"), validate(listTaxQuerySchema, "query"), controller.list);
router.get("/:id", requirePermission("taxes.view"), controller.getById);
router.post("/", requirePermission("taxes.create"), validate(createTaxSchema), controller.create);
router.put("/:id", requirePermission("taxes.update"), validate(updateTaxSchema), controller.update);
router.delete("/:id", requirePermission("taxes.delete"), controller.deactivate);

export default router;
