import { Router } from "express";
import * as controller from "./invoiceLayout.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createInvoiceLayoutSchema, updateInvoiceLayoutSchema, listInvoiceLayoutQuerySchema } from "./invoiceLayout.validators";

const router = Router();
router.use(authenticate);

// Readable by any authenticated user - the Customer form's "Invoice Layout" picker needs the
// catalog regardless of whether that user can manage settings. Only mutations are gated.
router.get("/", validate(listInvoiceLayoutQuerySchema, "query"), controller.list);
router.get("/:id", controller.getById);
router.post("/", requirePermission("settings.manage"), validate(createInvoiceLayoutSchema), controller.create);
router.put("/:id", requirePermission("settings.manage"), validate(updateInvoiceLayoutSchema), controller.update);
router.delete("/:id", requirePermission("settings.manage"), controller.remove);
router.put("/:id/set-default", requirePermission("settings.manage"), controller.setDefault);

export default router;
