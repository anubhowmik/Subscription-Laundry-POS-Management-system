import jwt from "jsonwebtoken";
import { env } from "../config/env";

/**
 * Every token carries a `typ` claim identifying which realm it belongs to, and each verifier
 * REQUIRES its own value. Without this, a token minted for a tenant user would validate on the
 * platform-operator routes (and vice versa), because both are signed with the same secret - a
 * single stolen company token would become a key to every company on the platform.
 */
export type TokenRealm = "user" | "platform";

class TokenRealmError extends Error {
  constructor() {
    super("Token is not valid for this realm");
  }
}

function assertRealm<T extends { typ?: string }>(payload: T, expected: TokenRealm): T {
  if (payload.typ !== expected) throw new TokenRealmError();
  return payload;
}

// --- Tenant user tokens -------------------------------------------------------------------

export interface AccessTokenPayload {
  sub: string; // userId
  roleId: string;
  isSystemAdmin: boolean;
  typ?: TokenRealm;
}

export function signAccessToken(payload: Omit<AccessTokenPayload, "typ">): string {
  return jwt.sign({ ...payload, typ: "user" satisfies TokenRealm }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return assertRealm(jwt.verify(token, env.jwt.secret) as AccessTokenPayload, "user");
}

export interface RefreshTokenPayload {
  sub: string; // userId
  jti: string; // refresh token record id
  typ?: TokenRealm;
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, "typ">): string {
  return jwt.sign({ ...payload, typ: "user" satisfies TokenRealm }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return assertRealm(jwt.verify(token, env.jwt.refreshSecret) as RefreshTokenPayload, "user");
}

// --- Platform operator tokens -------------------------------------------------------------

export interface PlatformAccessTokenPayload {
  sub: string; // platformAdminId
  typ?: TokenRealm;
}

export function signPlatformAccessToken(payload: Omit<PlatformAccessTokenPayload, "typ">): string {
  return jwt.sign({ ...payload, typ: "platform" satisfies TokenRealm }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function verifyPlatformAccessToken(token: string): PlatformAccessTokenPayload {
  return assertRealm(jwt.verify(token, env.jwt.secret) as PlatformAccessTokenPayload, "platform");
}

export interface PlatformRefreshTokenPayload {
  sub: string; // platformAdminId
  jti: string; // platform refresh token record id
  typ?: TokenRealm;
}

export function signPlatformRefreshToken(payload: Omit<PlatformRefreshTokenPayload, "typ">): string {
  return jwt.sign({ ...payload, typ: "platform" satisfies TokenRealm }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function verifyPlatformRefreshToken(token: string): PlatformRefreshTokenPayload {
  return assertRealm(jwt.verify(token, env.jwt.refreshSecret) as PlatformRefreshTokenPayload, "platform");
}
