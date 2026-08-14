import { Router } from "express";
import { z } from "zod";
import * as controller from "./billing.controller";
import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";

const checkoutSchema = z.object({
  planCode: z.string().min(1),
  interval: z.enum(["MONTHLY", "ANNUAL", "LIFETIME"]),
});

const verifySchema = z.object({
  billingPaymentId: z.string().uuid(),
});

const router = Router();

// Authenticated, but deliberately NOT behind requireActiveSubscription: a company whose trial
// has expired must still be able to see plans and pay. That is the whole point of this module.
router.use(authenticate);

router.get("/plans", controller.listPlans);
router.get("/subscription", controller.getSubscription);
router.post("/checkout", validate(checkoutSchema), controller.checkout);
router.post("/verify", validate(verifySchema), controller.verify);

export default router;
