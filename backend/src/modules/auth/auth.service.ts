import bcrypt from "bcryptjs";
import { randomUUID, randomInt } from "crypto";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AppError, AuthenticationError } from "../../utils/AppError";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../utils/jwt";
import { getEmailSender } from "../notifications/emailSender";
import { TRIAL_PLAN_CODE, TRIAL_DAYS } from "../../config/plans";

const VERIFICATION_CODE_TTL_MS = 15 * 60 * 1000;
const MAX_VERIFICATION_ATTEMPTS = 5;

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

  // tokenHash has a unique DB constraint. A literal shared placeholder here (e.g. "pending")
  // collides under any two concurrent login/refresh calls for anyone - a double-submitted
  // request, a client retry, etc. - since both inserts race for the same value; whichever loses
  // surfaces the raw constraint error to the client as a failed login. randomUUID() keeps the
  // placeholder unique per call, same as the eventual real hash will be.
  const record = await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: randomUUID(), // filled in below once the JWT (which embeds this record's id) is signed
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
  // Unverified accounts must never receive a token, and this needs a distinguishable code (not
  // just "Invalid username or password") so the frontend can route straight to the verify-email
  // screen instead of showing a generic login-failed toast.
  if (!user.emailVerified) {
    throw new AppError(401, "Please verify your email before signing in", undefined, "EMAIL_NOT_VERIFIED");
  }
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

function generateSixDigitCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

/**
 * Creates and emails a fresh verification code for the given user. Used both right after
 * registration and by resendVerificationCode() below. The raw code is never stored - only its
 * bcrypt hash, same discipline as RefreshToken.tokenHash.
 */
export async function generateVerificationCode(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.email) throw new AppError(400, "This account has no email address to verify");

  const code = generateSixDigitCode();
  const codeHash = await bcrypt.hash(code, 10);
  await prisma.emailVerificationCode.create({
    data: { userId, codeHash, expiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MS) },
  });

  // Pure one-click confirmation - the code is still the real, bcrypt-hashed secret that
  // verifyEmailCode() checks (same expiry/attempt-limit as before), but it's never shown to a
  // human or typed anywhere anymore. It only ever travels inside this link's query string.
  // VerifyEmailPage reads ?email=&code= and confirms automatically the moment the link is opened.
  const verifyUrl = `${env.clientUrl}/verify-email?email=${encodeURIComponent(user.email)}&code=${code}`;

  await getEmailSender().send({
    to: user.email,
    subject: "Confirm your email address",
    text: `Confirm your email to finish setting up your account: ${verifyUrl}\n\nThis link expires in 15 minutes. If you didn't request this, you can ignore this email.`,
    html: `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1e293b;">
        <div style="width: 44px; height: 44px; border-radius: 12px; background: #f0f9ff; display: flex; align-items: center; justify-content: center; font-size: 22px; margin-bottom: 16px;">&#9993;&#65039;</div>
        <h2 style="margin: 0 0 8px; font-size: 20px;">Confirm your email</h2>
        <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
          Tap the button below to confirm your email and finish setting up your account.
        </p>
        <p style="text-align: center; margin: 0 0 24px;">
          <a href="${verifyUrl}" style="background: #0284c7; color: #ffffff; padding: 12px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">
            Confirm my email
          </a>
        </p>
        <p style="color: #94a3b8; font-size: 12px; line-height: 1.6; margin: 0;">
          This link expires in 15 minutes. If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });

  // Returned so callers can surface it in the API response in dev (see env.showDevVerificationCode
  // in the controllers) - the mock email sender only logs to the server console, which is useless
  // for anyone testing signup without a terminal open. Never returned once a real provider is wired in.
  return { code };
}

/**
 * Looks up the user by email and, if they exist and aren't already verified, sends a fresh
 * code. Deliberately does not reveal whether the email exists either way - the controller
 * always responds with the same generic "if that email exists, a code was sent" shape.
 */
export async function resendVerificationCode(email: string) {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user || user.emailVerified) return undefined;
  return generateVerificationCode(user.id);
}

/**
 * Validates a verification code, marks the account verified, and - this is the moment the
 * trial actually starts, not registration - creates the org's Subscription and sets
 * trialEndsAt. See organization.service.ts registerOrganization(), which deliberately no
 * longer does either of those things.
 */
export async function verifyEmailCode(email: string, code: string) {
  const user = await prisma.user.findFirst({ where: { email } });
  // Same non-enumeration discipline as resendVerificationCode(): a made-up email or a wrong
  // code both come back as the same "invalid code" error.
  if (!user) throw new AppError(400, "Incorrect or expired verification code", undefined, "VERIFICATION_CODE_INVALID");
  if (user.emailVerified) return;

  const record = await prisma.emailVerificationCode.findFirst({
    where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!record) {
    throw new AppError(400, "Incorrect or expired verification code", undefined, "VERIFICATION_CODE_INVALID");
  }
  if (record.attemptCount >= MAX_VERIFICATION_ATTEMPTS) {
    throw new AppError(400, "Too many incorrect attempts - request a new code", undefined, "VERIFICATION_CODE_LOCKED");
  }

  const matches = await bcrypt.compare(code, record.codeHash);
  if (!matches) {
    await prisma.emailVerificationCode.update({ where: { id: record.id }, data: { attemptCount: { increment: 1 } } });
    throw new AppError(400, "Incorrect or expired verification code", undefined, "VERIFICATION_CODE_INVALID");
  }

  const basePlan = await prisma.plan.findUniqueOrThrow({ where: { code: TRIAL_PLAN_CODE } });
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.emailVerificationCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } }),
    prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } }),
    prisma.organization.update({ where: { id: user.organizationId }, data: { trialEndsAt } }),
    prisma.subscription.create({
      data: {
        organizationId: user.organizationId,
        planId: basePlan.id,
        status: "TRIALING",
        billingInterval: "MONTHLY",
        currentPeriodStart: new Date(),
        currentPeriodEnd: trialEndsAt,
      },
    }),
  ]);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const matches = user.passwordHash ? await bcrypt.compare(currentPassword, user.passwordHash) : false;
  if (!matches) throw new AuthenticationError("Current password is incorrect");

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
