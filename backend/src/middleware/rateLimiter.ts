import rateLimit from "express-rate-limit";

// Keyed by IP, and every till / back-office device in a branch usually shares the shop's one public
// IP - a single report page alone makes ~3 calls and a busy POS many more, so 300 per 15 minutes
// was reachable in normal use. 2000 still stops abuse; logins keep their own strict limit below.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please wait a moment and try again.", errors: [] },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts, please try again later.", errors: [] },
});
