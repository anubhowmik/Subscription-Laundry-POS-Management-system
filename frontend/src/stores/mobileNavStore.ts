import { create } from "zustand";

/** Whether the mobile navigation drawer (Sidebar's small-screen overlay form) is open. Shared
 * between Topbar (the hamburger toggle) and Sidebar (the drawer itself + auto-close on route
 * change) since they're siblings under AppLayout, not parent/child. */
export const useMobileNavStore = create<{ isOpen: boolean; toggle: () => void; close: () => void }>((set) => ({
  isOpen: false,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  close: () => set({ isOpen: false }),
}));
