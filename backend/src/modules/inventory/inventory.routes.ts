import { Router } from "express";
import * as controller from "./inventory.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import {
  adjustStockSchema,
  shipTransferSchema,
  receiveTransferSchema,
  listTransfersQuerySchema,
  listTransactionsQuerySchema,
  createStockAdjustmentSchema,
  listStockAdjustmentsQuerySchema,
} from "./inventory.validators";

const router = Router();
router.use(authenticate);

router.get("/transactions", requirePermission("inventory.view"), validate(listTransactionsQuerySchema, "query"), controller.listTransactions);
router.post("/adjust", requirePermission("inventory.adjust"), validate(adjustStockSchema), controller.adjustStock);

router.get("/transfers", requirePermission("inventory.transfer"), validate(listTransfersQuerySchema, "query"), controller.listTransfers);
router.post("/transfers", requirePermission("inventory.transfer"), validate(shipTransferSchema), controller.shipTransfer);
router.post("/transfers/:id/receive", requirePermission("inventory.transfer"), validate(receiveTransferSchema), controller.receiveTransfer);
router.post("/transfers/:id/cancel", requirePermission("inventory.transfer"), controller.cancelTransfer);

router.get("/adjustments", requirePermission("inventory.view"), validate(listStockAdjustmentsQuerySchema, "query"), controller.listStockAdjustments);
router.post("/adjustments", requirePermission("inventory.adjust"), validate(createStockAdjustmentSchema), controller.createStockAdjustment);
router.post("/adjustments/:id/reverse", requirePermission("inventory.reverse_adjustment"), controller.reverseStockAdjustment);

export default router;
