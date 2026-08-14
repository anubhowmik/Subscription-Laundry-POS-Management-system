import axios from "axios";
import { API_BASE_URL } from "./client";

/**
 * Platform operator API client. Deliberately a SEPARATE axios instance with its own
 * localStorage key from the company app, so being signed into a company portal and the
 * operator console in the same browser cannot clobber one another's session.
 */

const TOKEN_KEY = "platformAccessToken";

let accessToken: string | null = localStorage.getItem(TOKEN_KEY);

export function setPlatformAccessToken(token: string | null) {
  accessToken = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getPlatformAccessToken() {
  return accessToken;
}

export const platformApi = axios.create({
  baseURL: `${API_BASE_URL}/platform`,
  withCredentials: true,
});

platformApi.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

platformApi.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 && !window.location.pathname.startsWith("/platform/login")) {
      setPlatformAccessToken(null);
      window.location.href = "/platform/login";
    }
    return Promise.reject(error);
  },
);
