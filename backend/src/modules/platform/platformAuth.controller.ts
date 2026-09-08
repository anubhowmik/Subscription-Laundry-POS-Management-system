import { Request, Response } from "express";
import * as service from "./platformAuth.service";
import { sendSuccess } from "../../utils/apiResponse";
import { AuthenticationError } from "../../utils/AppError";
import { PLATFORM_REFRESH_COOKIE, platformRefreshCookieOptions } from "../../utils/authCookie";

function requestMeta(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers["user-agent"] };
}

function toSafeAdmin(admin: { id: string; username: string; email: string; fullName: string; isOwner: boolean; lastLoginAt: Date | null }) {
  return { id: admin.id, username: admin.username, email: admin.email, fullName: admin.fullName, isOwner: admin.isOwner, lastLoginAt: admin.lastLoginAt };
}

export async function login(req: Request, res: Response) {
  const { usernameOrEmail, password } = req.body;
  const { accessToken, refreshToken, admin } = await service.login(usernameOrEmail, password, requestMeta(req));
  res.cookie(PLATFORM_REFRESH_COOKIE, refreshToken, platformRefreshCookieOptions());
  return sendSuccess(res, { accessToken, admin: toSafeAdmin(admin) }, "Login successful");
}

export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.[PLATFORM_REFRESH_COOKIE];
  if (!token) throw new AuthenticationError("No refresh token provided");
  const { accessToken, refreshToken } = await service.refresh(token, requestMeta(req));
  res.cookie(PLATFORM_REFRESH_COOKIE, refreshToken, platformRefreshCookieOptions());
  return sendSuccess(res, { accessToken }, "Token refreshed");
}

export async function logout(req: Request, res: Response) {
  const token = req.cookies?.[PLATFORM_REFRESH_COOKIE];
  if (token) await service.logout(token);
  res.clearCookie(PLATFORM_REFRESH_COOKIE, { path: "/api/platform/auth" });
  return sendSuccess(res, null, "Logged out");
}

export async function me(req: Request, res: Response) {
  return sendSuccess(res, req.platformAdmin);
}
