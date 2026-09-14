import { Router } from "express";
import * as controller from "./importSales.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { uploadSpreadsheet } from "../../middleware/upload";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry", "app.pos_service", "app.pos_product"));

router.get("/", requirePermission("sales.create"), controller.listBatches);
router.post("/", requirePermission("sales.create"), uploadSpreadsheet.single("file"), controller.importSales);
// Reference's own `sell.delete` gate on revertSaleImport - this app's closest equivalent
// permission (see permissions.ts's own "Permanently delete draft quotes and deliveries"
// description, reused here for "permanently delete an imported batch of sales").
router.delete("/:batch", requirePermission("sales.delete"), controller.revertBatch);

export default router;
