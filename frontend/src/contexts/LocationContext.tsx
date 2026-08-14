import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import type { BusinessLocation } from "../types/api";

interface LocationContextValue {
  locations: BusinessLocation[];
  currentLocationId: string | null;
  currentLocation: BusinessLocation | null;
  setCurrentLocationId: (id: string) => void;
}

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const locations = user?.businessLocations ?? [];
  const [currentLocationId, setCurrentLocationIdState] = useState<string | null>(
    () => localStorage.getItem("currentLocationId"),
  );

  useEffect(() => {
    if (locations.length === 0) return;
    const stillValid = locations.some((l) => l.id === currentLocationId);
    if (!stillValid) {
      setCurrentLocationIdState(locations[0].id);
      localStorage.setItem("currentLocationId", locations[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, locations.length]);

  function setCurrentLocationId(id: string) {
    setCurrentLocationIdState(id);
    localStorage.setItem("currentLocationId", id);
  }

  const currentLocation = locations.find((l) => l.id === currentLocationId) ?? null;

  return (
    <LocationContext.Provider value={{ locations, currentLocationId, currentLocation, setCurrentLocationId }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useBusinessLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useBusinessLocation must be used within LocationProvider");
  return ctx;
}
