import { create } from "zustand";

const STORAGE_KEY = "currentAppKey";

function readStored(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(key: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Private browsing / storage disabled - Sidebar's useCurrentApp() falls back to deriving the
    // app from the URL in this case, so this is safe to swallow.
  }
}

/**
 * Which application's sidebar to show, set explicitly when a user opens an app from Home (see
 * HomePage.tsx's AppCard) rather than purely derived from the URL. This matters once a page can
 * legitimately belong to more than one app (e.g. /customers is reachable from POS Laundry,
 * Service POS, and Product POS) - a pure URL->app lookup can only ever return one deterministic
 * answer for a shared page, which would make the sidebar "snap" to the wrong app every time you
 * navigate into one. Sidebar.tsx's useCurrentApp() reads this first and only falls back to
 * guessing from the URL when the stored app doesn't actually contain the current page.
 */
export const useCurrentAppStore = create<{ appKey: string | null; setApp: (key: string) => void }>((set) => ({
  appKey: readStored(),
  setApp: (key) => {
    writeStored(key);
    set({ appKey: key });
  },
}));
