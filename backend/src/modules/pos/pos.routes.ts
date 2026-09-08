import { Router } from "express";
import * as controller from "./pos.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission, requireModePermission } from "../../middleware/permission";
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
// Any of the three POS-access tiers gets you into this router at all - the finer distinction
// (which mode you're actually allowed to use) is enforced per-request by requireModePermission()
// below, keyed off the mode field each checkout/hold-sale/quote body carries.
router.use(authenticate, requirePermission("pos.access", "pos.access.service", "pos.access.product"));
router.use(requirePermission("app.pos_laundry", "app.pos_service", "app.pos_product"));

router.get("/search", validate(posSearchQuerySchema, "query"), controller.search);
router.post("/checkout", requirePermission("sales.create"), validate(checkoutSchema), requireModePermission(), controller.checkout);

router.post("/hold-sale", validate(holdSaleSchema), requireModePermission(), controller.holdSale);
router.get("/hold-sales", validate(listHeldSalesQuerySchema, "query"), controller.listHeldSales);
router.get("/hold-sales/:id", controller.getHeldSale);
router.delete("/hold-sales/:id", controller.discardHeldSale);

router.get("/quotes", requirePermission("sales.quote"), validate(listQuotesQuerySchema, "query"), controller.listQuotes);
router.post("/quotes", requirePermission("sales.quote"), validate(checkoutSchema), requireModePermission(), controller.createQuote);
router.post("/quotes/:id/confirm", requirePermission("sales.quote"), validate(confirmQuoteSchema), controller.confirmQuote);
router.delete("/quotes/:id", requirePermission("sales.quote"), controller.voidQuote);

export default router;
