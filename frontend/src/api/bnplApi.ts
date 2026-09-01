import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { ApiSuccess } from "../types/api";

/**
 * React Query hooks for BNPL (Tamara/Tabby/MISPay). Sandbox-only today - see
 * backend/src/modules/bnpl/bnplGateway.ts. useBnplSessionStatus polls until the session reaches a
 * terminal-for-the-frontend status; there is no other "poll until status changes" precedent in
 * this app (Sidebar/OrdersPage use fixed-interval background refreshes, not this).
 */

export type BnplProvider = "TAMARA" | "TABBY" | "MISPAY";
export type BnplSessionStatus = "CREATED" | "APPROVED" | "CAPTURED" | "FAILED" | "CANCELLED" | "EXPIRED";

export interface BnplSession {
  id: string;
  provider: BnplProvider;
  status: BnplSessionStatus;
  amount: string;
  currency: string;
  checkoutUrl: string | null;
  expiresAt: string;
}

export function useCreateBnplSession() {
  return useMutation({
    mutationFn: async (input: { businessLocationId: string; provider: BnplProvider; amount: number; customerId: string; customerPhone: string }) =>
      (await api.post<ApiSuccess<BnplSession>>("/bnpl/sessions", input)).data.data,
  });
}

// Polls every 2s while the session is still in flight; stops once it lands on a terminal status
// (or the frontend has captured it and moved on). `enabled` lets the caller pause polling once
// the flow is done or the modal is closed.
export function useBnplSessionStatus(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["bnpl", "session", id],
    queryFn: async () => (await api.get<ApiSuccess<BnplSession>>(`/bnpl/sessions/${id}`)).data.data,
    enabled: Boolean(id) && enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || status === "CREATED" || status === "APPROVED") return 2000;
      return false;
    },
  });
}

export function useCaptureBnplSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post<ApiSuccess<BnplSession>>(`/bnpl/sessions/${id}/capture`)).data.data,
    onSuccess: (session) => qc.setQueryData(["bnpl", "session", session.id], session),
  });
}

// --- Settings ----------------------------------------------------------------------------

export interface BnplProviderSettingsRow {
  provider: BnplProvider;
  isEnabled: boolean;
  apiBaseUrlOverride: string | null;
  hasMerchantToken: boolean;
}

export function useBnplSettings() {
  return useQuery({
    queryKey: ["bnpl", "settings"],
    queryFn: async () => (await api.get<ApiSuccess<BnplProviderSettingsRow[]>>("/bnpl/settings")).data.data,
  });
}

export function useUpdateBnplProviderSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ provider, ...input }: { provider: BnplProvider; isEnabled: boolean; merchantToken?: string }) =>
      (await api.put<ApiSuccess<BnplProviderSettingsRow>>(`/bnpl/settings/${provider}`, input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bnpl", "settings"] }),
  });
}
