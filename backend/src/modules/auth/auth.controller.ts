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

  // isSystemAdmin already bypasses every branch-access check on the backend (see
  // assertLocationAccess/requireLocationAccess) - without this, the branch switcher would still
  // only offer whatever someone happened to assign via UserBusinessLocation, contradicting the
  // access the admin already has. INACTIVE branches stay out of the list: there is no live
  // business to switch into there, assigned or not.
  const businessLocations = user.isSystemAdmin
    ? await prisma.businessLocation.findMany({
        where: { organizationId: user.organizationId, status: "ACTIVE" },
        orderBy: { branchName: "asc" },
      })
    : user.businessLocations.map((bl) => bl.businessLocation);

  return sendSuccess(res, {
    ...toSafeUser(user),
    permissions: req.user!.permissions,
    businessLocations,
  });
}

export async function verifyEmail(req: Request, res: Response) {
  const { email, code } = req.body;
  await authService.verifyEmailCode(email, code);
  return sendSuccess(res, null, "Email verified");
}

export async function resendVerification(req: Request, res: Response) {
  const { email } = req.body;
  await authService.resendVerificationCode(email);
  // Deliberately the same response whether or not the email exists/is already verified - see
  // authService.resendVerificationCode()'s non-enumeration comment.
  return sendSuccess(res, null, "If that email exists and isn't verified yet, a new code was sent");
}

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req.user!.id, currentPassword, newPassword);
  return sendSuccess(res, null, "Password changed successfully");
}
