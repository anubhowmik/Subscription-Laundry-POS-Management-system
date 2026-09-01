import { Router } from "express";
import * as controller from "./compensation.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createCompensationSchema, resolveCompensationSchema, listCompensationQuerySchema } from "./compensation.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry"));

// Segregation of duties (P8-6): filing, approving, and paying are three distinct permissions.
// PUT /:id/resolve is shared by both the approve and the pay transition - requirePermission here
// only gates "has at least one of the two", the exact transition-specific check happens in
// compensation.service.ts's resolve() since only it knows which transition was requested.
router.get(
  "/",
  requirePermission("compensations.view_own", "compensations.view_all"),
  validate(listCompensationQuerySchema, "query"),
  controller.list,
);
router.post("/", requirePermission("compensations.file"), validate(createCompensationSchema), controller.create);
router.put(
  "/:id/resolve",
  requirePermission("compensations.approve", "compensations.pay"),
  validate(resolveCompensationSchema),
  controller.resolve,
);
router.delete("/:id", requirePermission("compensations.file", "compensations.approve"), controller.remove);

export default router;
