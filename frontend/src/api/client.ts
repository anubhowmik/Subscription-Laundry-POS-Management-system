import axios from "axios";
import type { InternalAxiosRequestConfig } from "axios";

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

let accessToken: string | null = localStorage.getItem("accessToken");

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) localStorage.setItem("accessToken", token);
  else localStorage.removeItem("accessToken");
}

export function getAccessToken() {
  return accessToken;
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // send the httpOnly refresh-token cookie
});

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true })
      .then((res) => {
        const token = res.data.data.accessToken as string;
        setAccessToken(token);
        return token;
      })
      .catch((err) => {
        // Only a definitive "the refresh token itself is invalid/expired/revoked" (401) means the
        // session is actually over - wipe it. Any other failure (429 rate limit, network error,
        // 5xx) is transient: leave the stored access token alone so the next request can retry,
        // instead of force-logging the user out over a blip that has nothing to do with their
        // session's validity.
        if (err.response?.status === 401) setAccessToken(null);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

// Pages that work perfectly well logged-out - a failed silent auth check here (e.g. a stale
// token left over from a previous session/browser tab) must NEVER hard-redirect the visitor
// away from what they actually opened. AuthContext's own bootstrap effect already handles a
// failed /auth/me call correctly on its own (clears the token, renders the logged-out view) -
// the only thing that needs guarding against is THIS interceptor separately force-navigating
// on top of that. Redirecting to /login is only appropriate once a genuinely protected page
// (dashboard, users, pos, ...) can no longer reach the API - i.e. someone actively using the
// app who just got logged out mid-session.
const PUBLIC_PATHS = ["/", "/login", "/register", "/verify-email"];
function isOnPublicPage() {
  return PUBLIC_PATHS.includes(window.location.pathname);
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config as RetryableConfig | undefined;
    const isAuthEndpoint = originalRequest?.url?.includes("/auth/login") || originalRequest?.url?.includes("/auth/refresh");

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      const token = await refreshAccessToken();
      if (token) {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      }
      // getAccessToken() is only cleared inside refreshAccessToken() when the refresh call itself
      // came back 401 (session genuinely over). A transient refresh failure (429/network/5xx)
      // leaves it set, so the user stays on the current page and can just retry - no hard redirect.
      if (!getAccessToken() && !isOnPublicPage()) {
        window.location.href = "/login";
      }
    }

    // 402 = the organization's trial/subscription has lapsed. Send them to the billing page so
    // they can pay, unless they are already there.
    if (
      error.response?.status === 402 &&
      error.response?.data?.code === "SUBSCRIPTION_REQUIRED" &&
      !window.location.pathname.startsWith("/billing")
    ) {
      window.location.href = "/billing";
    }

    return Promise.reject(error);
  },
);
