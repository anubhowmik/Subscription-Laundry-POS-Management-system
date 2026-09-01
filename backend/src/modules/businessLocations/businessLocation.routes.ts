import { Router } from "express";
import * as controller from "./businessLocation.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import {
  createBusinessLocationSchema,
  invoiceLayoutSettingsSchema,
  listBusinessLocationQuerySchema,
  updateBusinessLocationSchema,
} from "./businessLocation.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry"));

router.get("/", requirePermission("business_locations.view"), validate(listBusinessLocationQuerySchema, "query"), controller.list);
router.get("/:id", requirePermission("business_locations.view"), controller.getById);
router.post("/", requirePermission("business_locations.create"), validate(createBusinessLocationSchema), controller.create);
router.put("/:id", requirePermission("business_locations.update"), validate(updateBusinessLocationSchema), controller.update);
router.delete("/:id", requirePermission("business_locations.delete"), controller.deactivate);
router.post("/:id/reactivate", requirePermission("business_locations.update"), controller.reactivate);
router.get("/:id/invoice-layout", requirePermission("business_locations.view"), controller.getInvoiceLayout);
router.put("/:id/invoice-layout", requirePermission("business_locations.update"), validate(invoiceLayoutSettingsSchema), controller.updateInvoiceLayout);

export default router;
