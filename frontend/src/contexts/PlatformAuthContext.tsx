import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { platformApi, getPlatformAccessToken, setPlatformAccessToken } from "../api/platformClient";
import type { ApiSuccess } from "../types/api";

export interface PlatformAdmin {
  id: string;
  username: string;
  fullName: string;
  isOwner: boolean;
}

interface PlatformAuthContextValue {
  admin: PlatformAdmin | null;
  loading: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const PlatformAuthContext = createContext<PlatformAuthContextValue | null>(null);

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<PlatformAdmin | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchMe() {
    const res = await platformApi.get<ApiSuccess<PlatformAdmin>>("/auth/me");
    setAdmin(res.data.data);
  }

  useEffect(() => {
    async function bootstrap() {
      if (!getPlatformAccessToken()) {
        setLoading(false);
        return;
      }
      try {
        await fetchMe();
      } catch {
        setPlatformAccessToken(null);
        setAdmin(null);
      } finally {
        setLoading(false);
      }
    }
    bootstrap();
  }, []);

  async function login(usernameOrEmail: string, password: string) {
    const res = await platformApi.post<ApiSuccess<{ accessToken: string; admin: PlatformAdmin }>>("/auth/login", {
      usernameOrEmail,
      password,
    });
    setPlatformAccessToken(res.data.data.accessToken);
    await fetchMe();
  }

  async function logout() {
    try {
      await platformApi.post("/auth/logout");
    } finally {
      setPlatformAccessToken(null);
      setAdmin(null);
    }
  }

  return (
    <PlatformAuthContext.Provider value={{ admin, loading, login, logout }}>{children}</PlatformAuthContext.Provider>
  );
}

export function usePlatformAuth() {
  const ctx = useContext(PlatformAuthContext);
  if (!ctx) throw new Error("usePlatformAuth must be used within PlatformAuthProvider");
  return ctx;
}
