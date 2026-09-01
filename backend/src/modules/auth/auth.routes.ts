import { Router } from "express";
import * as controller from "./auth.controller";
import { validate } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { authLimiter } from "../../middleware/rateLimiter";
import { changePasswordSchema, loginSchema, verifyEmailSchema, resendVerificationSchema } from "./auth.validators";

const router = Router();

router.post("/login", authLimiter, validate(loginSchema), controller.login);
router.post("/refresh", controller.refresh);
router.post("/logout", controller.logout);
router.post("/verify-email", authLimiter, validate(verifyEmailSchema), controller.verifyEmail);
router.post("/resend-verification", authLimiter, validate(resendVerificationSchema), controller.resendVerification);
router.get("/me", authenticate, controller.me);
router.post("/change-password", authenticate, validate(changePasswordSchema), controller.changePassword);

export default router;
