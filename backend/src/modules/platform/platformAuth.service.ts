import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AuthenticationError } from "../../utils/AppError";
import {
  signPlatformAccessToken,
  signPlatformRefreshToken,
  verifyPlatformRefreshToken,
} from "../../utils/jwt";

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

export async function issueTokens(platformAdminId: string, meta: RequestMeta) {
  // See identical fix + rationale in modules/auth/auth.service.ts's issueTokens(): a shared
  // literal placeholder collides under concurrent calls against the unique tokenHash constraint.
  const record = await prisma.platformRefreshToken.create({
    data: {
      platformAdminId,
      tokenHash: randomUUID(),
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      expiresAt: new Date(Date.now() + msFromDuration(env.jwt.refreshExpiresIn)),
    },
  });

  const refreshToken = signPlatformRefreshToken({ sub: platformAdminId, jti: record.id });
  const tokenHash = await bcrypt.hash(refreshToken, 10);
  await prisma.platformRefreshToken.update({ where: { id: record.id }, data: { tokenHash } });

  return { accessToken: signPlatformAccessToken({ sub: platformAdminId }), refreshToken };
}

export async function login(usernameOrEmail: string, password: string, meta: RequestMeta) {
  const admin = await prisma.platformAdmin.findFirst({
    where: { OR: [{ username: usernameOrEmail }, { email: usernameOrEmail.toLowerCase() }] },
  });

  // Always run a comparison so a missing account and a wrong password take the same time,
  // otherwise response timing reveals which usernames exist.
  const hash = admin?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin";
  const isValid = await bcrypt.compare(password, hash);

  if (!admin || !isValid) throw new AuthenticationError("Invalid username or password");
  if (admin.status !== "ACTIVE") throw new AuthenticationError("This platform account is not active");

  await prisma.platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });

  const tokens = await issueTokens(admin.id, meta);
  return { ...tokens, admin };
}

export async function refresh(oldToken: string, meta: RequestMeta) {
  let payload;
  try {
    payload = verifyPlatformRefreshToken(oldToken);
  } catch {
    throw new AuthenticationError("Invalid or expired refresh token");
  }

  const record = await prisma.platformRefreshToken.findUnique({ where: { id: payload.jti } });
  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new AuthenticationError("Refresh token is no longer valid");
  }
  if (!(await bcrypt.compare(oldToken, record.tokenHash))) {
    throw new AuthenticationError("Refresh token is no longer valid");
  }

  await prisma.platformRefreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
  return issueTokens(record.platformAdminId, meta);
}

export async function logout(token: string) {
  try {
    const payload = verifyPlatformRefreshToken(token);
    await prisma.platformRefreshToken.updateMany({ where: { id: payload.jti }, data: { revokedAt: new Date() } });
  } catch {
    // already invalid - nothing to revoke
  }
}
