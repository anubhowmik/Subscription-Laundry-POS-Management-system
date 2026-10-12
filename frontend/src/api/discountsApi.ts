import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { ApiSuccess } from "../types/api";

interface Named {
  nameEn: string;
  nameAr: string | null;
}

export interface DiscountRow {
  id: string;
  name: string;
  itemKeys: string[];
  brandId: string | null;
  categoryKey: string | null;
  businessLocationId: string;
  priority: number | null;
  discountType: "FIXED" | "PERCENTAGE";
  discountAmount: string;
  startsAt: string;
  endsAt: string;
  priceListId: string | null;
  applicableInCg: boolean;
  isActive: boolean;
  businessLocation: { branchName: string; branchNameAr: string | null; branchCode: string };
  brand: Named | null;
  priceList: Named | null;
  category: Named | null;
  items: (Named & { key: string; code?: string | null })[];
}

export interface DiscountFormOptions {
  locations: { id: string; branchName: string; branchNameAr: string | null; branchCode: string }[];
  brands: ({ id: string } & Named)[];
  priceLists: ({ id: string } & Named)[];
  categories: ({ key: string; kind: "PRODUCT" | "SERVICE" } & Named)[];
  items: ({ key: string; code: string | null; kind: "PRODUCT" | "SERVICE" } & Named)[];
}

export function useDiscountFormOptions() {
  return useQuery({
    queryKey: ["discounts", "options"],
    queryFn: async () => (await api.get<ApiSuccess<DiscountFormOptions>>("/discounts/options")).data.data,
    staleTime: 60_000,
  });
}

/** What the POS pre-fills on a cart line (reference getProductDiscount). */
export interface MatchedDiscount {
  id: string;
  name: string;
  discountType: "FIXED" | "PERCENTAGE";
  discountAmount: string;
  startsAt: string;
  endsAt: string;
}

export async function matchDiscounts(body: { businessLocationId: string; customerId: string; priceListId?: string; itemKeys: string[] }) {
  return (await api.post<ApiSuccess<Record<string, MatchedDiscount>>>("/pos/discounts/match", body)).data.data;
}
