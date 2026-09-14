import { Router } from "express";
import * as controller from "./sale.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { uploadSaleDocument } from "../../middleware/upload";
import { updateItemStatusSchema, listBoardItemsQuerySchema, payDueSchema, listShipmentsQuerySchema } from "./sale.validators";

const router = Router();
router.use(authenticate, requirePermission("sales.view"));
router.use(requirePermission("app.pos_laundry", "app.pos_service", "app.pos_product"));

// Add Sale's "Attach Document" - uploaded separately from checkout (checkout is plain JSON, not
// multipart) before the Sale row exists yet, so this returns an opaque path the checkout payload
// then references - see pos.service.ts checkout()'s documentPath handling.
router.post("/documents", requirePermission("sales.create"), uploadSaleDocument.single("document"), controller.uploadDocument);
router.get("/:id/document", controller.downloadDocument);

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
// Reference's own "Shipments" list (SellController@shipments) - like /board above, a
// laundry-workflow concept scoped to POS Laundry + Service POS, not the plain-sale-list
// permission scope the rest of this router uses.
router.get(
  "/shipments",
  requirePermission("app.pos_laundry", "app.pos_service"),
  validate(listShipmentsQuerySchema, "query"),
  controller.listShipments,
);
router.get("/:id", controller.getById);
router.get("/:id/qr", controller.getQr);
router.post("/:id/submit-to-zatca", requirePermission("sales.update"), controller.submitToZatca);
router.post("/:id/pay-due", requirePermission("sales.update"), validate(payDueSchema), controller.payDue);
router.patch(
  "/:id/items/:itemId/status",
  requirePermission("app.pos_laundry", "app.pos_service"),
  requirePermission("sales.update"),
  validate(updateItemStatusSchema),
  controller.updateItemStatus,
);

export default router;
