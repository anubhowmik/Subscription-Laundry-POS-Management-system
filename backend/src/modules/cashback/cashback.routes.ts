import { Router } from "express";
import * as controller from "./cashback.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { adjustCashbackSchema } from "./cashback.validators";

const router = Router();
router.use(authenticate, requirePermission("cashback.manage"));
router.use(requirePermission("app.pos_laundry"));

router.get("/customers/:customerId", controller.getLedger);
router.post("/customers/:customerId/adjust", validate(adjustCashbackSchema), controller.adjustCashback);

export default router;
