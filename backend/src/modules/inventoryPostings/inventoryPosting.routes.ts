import { Router } from "express";
import * as controller from "./inventoryPosting.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import {
  inventoryPostingSchema,
  listInventoryPostingQuerySchema,
  listClassifiedSalesQuerySchema,
  searchReadySalesQuerySchema,
} from "./inventoryPosting.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry", "app.pos_product"));
router.use(requirePermission("inventory_postings.manage"));

router.get("/search-ready-sales", validate(searchReadySalesQuerySchema, "query"), controller.searchReadySales);
router.get("/classified-sales", validate(listClassifiedSalesQuerySchema, "query"), controller.listClassifiedSales);
router.get("/", validate(listInventoryPostingQuerySchema, "query"), controller.list);
router.get("/:id", controller.getById);
router.post("/", validate(inventoryPostingSchema), controller.create);
router.put("/:id", validate(inventoryPostingSchema), controller.update);
router.put("/:id/confirm", controller.confirm);
router.put("/:id/reconcile", controller.reconcile);
router.delete("/:id", controller.remove);

export default router;
