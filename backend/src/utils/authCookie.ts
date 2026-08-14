import { env } from "../config/env";

export const REFRESH_COOKIE = "refreshToken";

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax" as const,
    path: "/api/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

/**
 * Distinct cookie name AND path from the tenant one, so a browser signed into a company portal
 * and the platform console at the same time cannot have one session overwrite the other.
 */
export const PLATFORM_REFRESH_COOKIE = "platformRefreshToken";

export function platformRefreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax" as const,
    path: "/api/platform/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}
