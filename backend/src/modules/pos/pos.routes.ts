import { Router } from "express";
import * as controller from "./pos.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import {
  checkoutSchema,
  confirmQuoteSchema,
  holdSaleSchema,
  listHeldSalesQuerySchema,
  listQuotesQuerySchema,
  posSearchQuerySchema,
} from "./pos.validators";

const router = Router();
router.use(authenticate, requirePermission("pos.access"));
router.use(requirePermission("app.pos_laundry"));

router.get("/search", validate(posSearchQuerySchema, "query"), controller.search);
router.post("/checkout", requirePermission("sales.create"), validate(checkoutSchema), controller.checkout);

router.post("/hold-sale", validate(holdSaleSchema), controller.holdSale);
router.get("/hold-sales", validate(listHeldSalesQuerySchema, "query"), controller.listHeldSales);
router.get("/hold-sales/:id", controller.getHeldSale);
router.delete("/hold-sales/:id", controller.discardHeldSale);

router.get("/quotes", requirePermission("sales.quote"), validate(listQuotesQuerySchema, "query"), controller.listQuotes);
router.post("/quotes", requirePermission("sales.quote"), validate(checkoutSchema), controller.createQuote);
router.post("/quotes/:id/confirm", requirePermission("sales.quote"), validate(confirmQuoteSchema), controller.confirmQuote);
router.delete("/quotes/:id", requirePermission("sales.quote"), controller.voidQuote);

export default router;
