import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AuthenticationError } from "../../utils/AppError";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../utils/jwt";

interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

function msFromDuration(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(match[1]) * multipliers[match[2]];
}

export async function issueTokens(userId: string, meta: RequestMeta) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const record = await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: "pending", // filled in below once the JWT (which embeds this record's id) is signed
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      expiresAt: new Date(Date.now() + msFromDuration(env.jwt.refreshExpiresIn)),
    },
  });

  const refreshToken = signRefreshToken({ sub: userId, jti: record.id });
  const tokenHash = await bcrypt.hash(refreshToken, 10);
  await prisma.refreshToken.update({ where: { id: record.id }, data: { tokenHash } });

  const accessToken = signAccessToken({ sub: userId, roleId: user.roleId, isSystemAdmin: user.isSystemAdmin });

  return { accessToken, refreshToken };
}

export async function login(usernameOrEmail: string, password: string, meta: RequestMeta) {
  const user = await prisma.user.findFirst({
    where: { OR: [{ username: usernameOrEmail }, { email: usernameOrEmail }] },
    include: { organization: { select: { status: true } } },
  });

  const isValid = user?.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;

  await prisma.loginAttempt.create({
    data: {
      userId: user?.id,
      username: usernameOrEmail,
      success: isValid,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    },
  });

  if (!user || !isValid) throw new AuthenticationError("Invalid username or password");
  if (user.status !== "ACTIVE" || user.deletedAt) throw new AuthenticationError("Account is inactive");
  // Suspension has to be enforced here as well as in `authenticate`. Checking only on
  // subsequent requests would still hand a suspended company a valid token pair and tell them
  // "Login successful", which is both wrong and confusing.
  if (user.organization.status === "SUSPENDED" || user.organization.status === "CANCELLED") {
    throw new AuthenticationError("This organization's account is not active. Contact support.");
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const tokens = await issueTokens(user.id, meta);
  return { ...tokens, user };
}

export async function refresh(oldToken: string, meta: RequestMeta) {
  let payload;
  try {
    payload = verifyRefreshToken(oldToken);
  } catch {
    throw new AuthenticationError("Invalid or expired refresh token");
  }

  const record = await prisma.refreshToken.findUnique({ where: { id: payload.jti } });
  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new AuthenticationError("Refresh token is no longer valid");
  }
  const matches = await bcrypt.compare(oldToken, record.tokenHash);
  if (!matches) throw new AuthenticationError("Refresh token is no longer valid");

  // Rotate: revoke the used token and issue a fresh pair.
  await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
  return issueTokens(record.userId, meta);
}

export async function logout(token: string) {
  try {
    const payload = verifyRefreshToken(token);
    await prisma.refreshToken.updateMany({ where: { id: payload.jti }, data: { revokedAt: new Date() } });
  } catch {
    // token already invalid/expired - nothing to revoke
  }
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const matches = user.passwordHash ? await bcrypt.compare(currentPassword, user.passwordHash) : false;
  if (!matches) throw new AuthenticationError("Current password is incorrect");

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
