import { Router } from "express";
import * as controller from "./customerGroup.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createCustomerGroupSchema, listCustomerGroupQuerySchema, updateCustomerGroupSchema } from "./customerGroup.validators";

const router = Router();
router.use(authenticate);

router.get("/", requirePermission("customer_groups.view"), validate(listCustomerGroupQuerySchema, "query"), controller.list);
router.get("/:id", requirePermission("customer_groups.view"), controller.getById);
router.post("/", requirePermission("customer_groups.create"), validate(createCustomerGroupSchema), controller.create);
router.put("/:id", requirePermission("customer_groups.update"), validate(updateCustomerGroupSchema), controller.update);
router.delete("/:id", requirePermission("customer_groups.delete"), controller.deactivate);

export default router;
