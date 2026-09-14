import { Router } from "express";
import * as controller from "./sellReturn.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createSellReturnSchema, updateSellReturnSchema, addSellReturnPaymentSchema, listSellReturnQuerySchema } from "./sellReturn.validators";

const router = Router();
router.use(authenticate, requirePermission("sales.return"));
router.use(requirePermission("app.pos_laundry", "app.pos_service", "app.pos_product"));

router.get("/sale/:saleId", controller.getReturnableSale);
router.get("/", validate(listSellReturnQuerySchema, "query"), controller.list);
router.get("/:id", controller.getById);
router.post("/", validate(createSellReturnSchema), controller.create);
router.put("/:id", validate(updateSellReturnSchema), controller.update);
router.post("/:id/pay-due", validate(addSellReturnPaymentSchema), controller.addPayment);
router.delete("/:id", controller.remove);

export default router;
