import { Router } from "express";
import * as controller from "./bnpl.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createBnplSessionSchema, updateBnplProviderSettingsSchema } from "./bnpl.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry", "app.pos_service", "app.pos_product"));

// Session create/poll/capture happen mid-checkout, so they're gated the same way as
// pos.routes.ts's /checkout: pos.access to be on the POS screen at all, sales.create to actually
// move money. Settings are a separate, dedicated permission (bnpl.manage) - an org owner
// configuring providers may not have pos.access at all.
router.post("/sessions", requirePermission("pos.access"), requirePermission("sales.create"), validate(createBnplSessionSchema), controller.createSession);
router.get("/sessions/:id", requirePermission("pos.access"), controller.getSessionStatus);
router.post("/sessions/:id/capture", requirePermission("pos.access"), requirePermission("sales.create"), controller.captureSession);

router.get("/settings", requirePermission("bnpl.manage"), controller.listSettings);
router.put("/settings/:provider", requirePermission("bnpl.manage"), validate(updateBnplProviderSettingsSchema), controller.updateProviderSettings);

export default router;
