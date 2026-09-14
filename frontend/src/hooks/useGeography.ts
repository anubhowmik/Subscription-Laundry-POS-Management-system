import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { ApiSuccess } from "../types/api";

export interface GeoCountry {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string | null;
}
export interface GeoState {
  id: string;
  nameEn: string;
  nameAr: string | null;
}
export interface GeoCity {
  id: string;
  nameEn: string;
  nameAr: string | null;
}

/** Matches the reference's cascading Country -> State -> City address dropdowns (backed by its
 * own Country/State/City tables) - see schema.prisma's Country/State/City models. */
export function useCountries() {
  return useQuery({
    queryKey: ["geo-countries"],
    queryFn: async () => (await api.get<ApiSuccess<GeoCountry[]>>("/geo/countries")).data.data,
    staleTime: Infinity,
  });
}

export function useStates(countryId: string | null) {
  return useQuery({
    queryKey: ["geo-states", countryId],
    queryFn: async () => (await api.get<ApiSuccess<GeoState[]>>("/geo/states", { params: { countryId } })).data.data,
    enabled: !!countryId,
    staleTime: Infinity,
  });
}

export function useCities(stateId: string | null) {
  return useQuery({
    queryKey: ["geo-cities", stateId],
    queryFn: async () => (await api.get<ApiSuccess<GeoCity[]>>("/geo/cities", { params: { stateId } })).data.data,
    enabled: !!stateId,
    staleTime: Infinity,
  });
}
