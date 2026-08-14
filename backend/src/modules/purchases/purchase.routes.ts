import { Router } from "express";
import * as controller from "./purchase.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import {
  createPurchaseSchema,
  createPurchaseReturnSchema,
  listPurchaseQuerySchema,
  listPurchaseReturnQuerySchema,
} from "./purchase.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("purchases.manage"));

router.get("/", validate(listPurchaseQuerySchema, "query"), controller.list);
router.get("/returns", validate(listPurchaseReturnQuerySchema, "query"), controller.listReturns);
router.get("/:purchaseId/returnable", controller.getReturnablePurchase);
router.get("/:id", controller.getById);
router.post("/", validate(createPurchaseSchema), controller.create);
router.post("/returns", validate(createPurchaseReturnSchema), controller.createReturn);

export default router;
