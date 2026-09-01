import { Router } from "express";
import * as controller from "./dashboard.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry"));

router.get("/summary", controller.getSummary);

export default router;
