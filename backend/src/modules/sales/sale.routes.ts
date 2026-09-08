import { Router } from "express";
import * as controller from "./sale.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { updateItemStatusSchema, listBoardItemsQuerySchema } from "./sale.validators";

const router = Router();
router.use(authenticate, requirePermission("sales.view"));
router.use(requirePermission("app.pos_laundry", "app.pos_service", "app.pos_product"));

router.get("/", controller.list);
// The fulfillment board ("what's still washing / ready / delivered") is a service-workflow
// concept - a bag of detergent doesn't move through wash stages - so it and the status-update
// endpoint that drives it are narrowed to Service POS + POS Laundry, unlike the rest of this
// router (plain sale list/detail/QR/ZATCA), which is genuinely channel-agnostic.
router.get(
  "/board",
  requirePermission("app.pos_laundry", "app.pos_service"),
  validate(listBoardItemsQuerySchema, "query"),
  controller.listBoardItems,
);
router.get("/:id", controller.getById);
router.get("/:id/qr", controller.getQr);
router.post("/:id/submit-to-zatca", requirePermission("sales.update"), controller.submitToZatca);
router.patch(
  "/:id/items/:itemId/status",
  requirePermission("app.pos_laundry", "app.pos_service"),
  requirePermission("sales.update"),
  validate(updateItemStatusSchema),
  controller.updateItemStatus,
);

export default router;
