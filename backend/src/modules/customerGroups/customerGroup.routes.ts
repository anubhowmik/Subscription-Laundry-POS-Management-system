import { Router } from "express";
import * as controller from "./customerGroup.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createCustomerGroupSchema, listCustomerGroupQuerySchema, payGroupDueSchema, updateCustomerGroupSchema } from "./customerGroup.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry", "app.pos_service", "app.pos_product"));

router.get("/", requirePermission("customer_groups.view"), validate(listCustomerGroupQuerySchema, "query"), controller.list);
router.get("/:id", requirePermission("customer_groups.view"), controller.getById);
router.post("/", requirePermission("customer_groups.create"), validate(createCustomerGroupSchema), controller.create);
router.put("/:id", requirePermission("customer_groups.update"), validate(updateCustomerGroupSchema), controller.update);
router.delete("/:id", requirePermission("customer_groups.delete"), controller.deactivate);
router.put("/:id/activate", requirePermission("customer_groups.update"), controller.activate);
router.get("/:id/due", requirePermission("customer_groups.view", "sales.update"), controller.getDue);
router.post("/:id/pay-due", requirePermission("customer_groups.update", "sales.update"), validate(payGroupDueSchema), controller.payDue);

export default router;
