import { Router } from "express";
import * as controller from "./sale.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { updateItemStatusSchema, listBoardItemsQuerySchema } from "./sale.validators";

const router = Router();
router.use(authenticate, requirePermission("sales.view"));

router.get("/", controller.list);
router.get("/board", validate(listBoardItemsQuerySchema, "query"), controller.listBoardItems);
router.get("/:id", controller.getById);
router.get("/:id/qr", controller.getQr);
router.post("/:id/submit-to-zatca", requirePermission("sales.update"), controller.submitToZatca);
router.patch(
  "/:id/items/:itemId/status",
  requirePermission("sales.update"),
  validate(updateItemStatusSchema),
  controller.updateItemStatus,
);

export default router;
