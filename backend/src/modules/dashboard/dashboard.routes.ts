import { Router } from "express";
import * as controller from "./dashboard.controller";
import { authenticate } from "../../middleware/authenticate";

const router = Router();
router.use(authenticate);

router.get("/summary", controller.getSummary);

export default router;
