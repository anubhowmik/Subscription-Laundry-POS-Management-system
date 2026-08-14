import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, getAccessToken, setAccessToken } from "../api/client";
import type { ApiSuccess, AuthUser } from "../types/api";

export interface RegisterOrganizationInput {
  organizationNameEn: string;
  organizationNameAr: string;
  adminUsername: string;
  adminEmail: string;
  adminPassword: string;
  adminFullNameEn: string;
  adminFullNameAr?: string;
  adminPhone?: string;
  branchName?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  registerOrganization: (input: RegisterOrganizationInput) => Promise<void>;
  logout: () => Promise<void>;
  can: (...permissions: string[]) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchMe() {
    const res = await api.get<ApiSuccess<AuthUser>>("/auth/me");
    setUser(res.data.data);
  }

  useEffect(() => {
    async function bootstrap() {
      if (!getAccessToken()) {
        setLoading(false);
        return;
      }
      try {
        await fetchMe();
      } catch {
        setAccessToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    bootstrap();
  }, []);

  async function login(usernameOrEmail: string, password: string) {
    const res = await api.post<ApiSuccess<{ accessToken: string; user: AuthUser }>>("/auth/login", {
      usernameOrEmail,
      password,
    });
    setAccessToken(res.data.data.accessToken);
    await fetchMe();
  }

  async function registerOrganization(input: RegisterOrganizationInput) {
    const res = await api.post<ApiSuccess<{ accessToken: string; user: AuthUser }>>("/organizations/register", input);
    setAccessToken(res.data.data.accessToken);
    await fetchMe();
  }

  async function logout() {
    try {
      await api.post("/auth/logout");
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }

  function can(...permissions: string[]) {
    if (!user) return false;
    if (user.isSystemAdmin) return true;
    return permissions.some((p) => user.permissions.includes(p));
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, registerOrganization, logout, can, refreshUser: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
