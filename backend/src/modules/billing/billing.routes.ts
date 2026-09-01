import { Router } from "express";
import { z } from "zod";
import * as controller from "./billing.controller";
import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";

const checkoutSchema = z.object({
  planCode: z.string().min(1),
  interval: z.enum(["MONTHLY", "ANNUAL", "LIFETIME"]),
});

const checkoutSeatsSchema = z.object({
  quantity: z.number().int().min(1).max(100),
});

const verifySchema = z.object({
  billingPaymentId: z.string().uuid(),
});

const router = Router();

// Authenticated, but deliberately NOT behind requireActiveSubscription: a company whose trial
// has expired must still be able to see plans and pay - that is the whole point of this module.
// Seat purchases are reachable the same way, for the same reason: you may need to buy a seat
// mid-trial or right after subscribing, before requireActiveSubscription would even let you
// reach anywhere else.
router.use(authenticate);

router.get("/plans", controller.listPlans);
router.get("/subscription", controller.getSubscription);
router.get("/seats", controller.getSeats);
router.post("/checkout", validate(checkoutSchema), controller.checkout);
router.post("/checkout-seats", validate(checkoutSeatsSchema), controller.checkoutSeats);
router.post("/verify", validate(verifySchema), controller.verify);

export default router;
