import { Request, Response } from "express";
import * as authService from "./auth.service";
import { toSafeUser } from "../users/user.mapper";
import { sendSuccess } from "../../utils/apiResponse";
import { AuthenticationError } from "../../utils/AppError";
import { prisma } from "../../config/prisma";
import { REFRESH_COOKIE, refreshCookieOptions } from "../../utils/authCookie";

function requestMeta(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers["user-agent"] };
}

export async function login(req: Request, res: Response) {
  const { usernameOrEmail, password } = req.body;
  const { accessToken, refreshToken, user } = await authService.login(usernameOrEmail, password, requestMeta(req));
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  return sendSuccess(res, { accessToken, user: toSafeUser(user) }, "Login successful");
}

export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw new AuthenticationError("No refresh token provided");
  const { accessToken, refreshToken } = await authService.refresh(token, requestMeta(req));
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  return sendSuccess(res, { accessToken }, "Token refreshed");
}

export async function logout(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) await authService.logout(token);
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
  return sendSuccess(res, null, "Logged out");
}

export async function me(req: Request, res: Response) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.id },
    include: { role: true, businessLocations: { include: { businessLocation: true } }, organization: true },
  });
  return sendSuccess(res, {
    ...toSafeUser(user),
    permissions: req.user!.permissions,
    businessLocations: user.businessLocations.map((bl) => bl.businessLocation),
  });
}

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req.user!.id, currentPassword, newPassword);
  return sendSuccess(res, null, "Password changed successfully");
}
