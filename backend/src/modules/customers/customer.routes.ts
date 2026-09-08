import { Router } from "express";
import * as controller from "./customer.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import {
  applyCreditToSaleSchema,
  createCustomerSchema,
  listCustomerQuerySchema,
  setApprovalStatusSchema,
  updateCustomerSchema,
} from "./customer.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry", "app.pos_service", "app.pos_product"));

router.get("/", requirePermission("customers.view"), validate(listCustomerQuerySchema, "query"), controller.list);
router.get("/:id", requirePermission("customers.view"), controller.getById);
router.get("/:id/profile", requirePermission("customers.view"), controller.getProfile);
router.post("/", requirePermission("customers.create"), validate(createCustomerSchema), controller.create);
router.put("/:id", requirePermission("customers.update"), validate(updateCustomerSchema), controller.update);
router.delete("/:id", requirePermission("customers.delete"), controller.deactivate);
router.put("/:id/approve", requirePermission("customers.approve"), validate(setApprovalStatusSchema), controller.setApprovalStatus);
router.post("/:id/apply-credit", requirePermission("customers.update"), validate(applyCreditToSaleSchema), controller.applyCreditToSale);

export default router;
