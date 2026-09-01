import { Router } from "express";
import * as controller from "./loyalty.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { adjustPointsSchema } from "./loyalty.validators";

const router = Router();
router.use(authenticate, requirePermission("loyalty.manage"));
router.use(requirePermission("app.pos_laundry"));

router.get("/customers/:customerId", controller.getLedger);
router.post("/customers/:customerId/adjust", validate(adjustPointsSchema), controller.adjustPoints);

export default router;
