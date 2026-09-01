import { create } from "zustand";

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button as a destructive (red) action - use for delete/deactivate/void/cancel. */
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  isOpen: boolean;
  resolve: ((value: boolean) => void) | null;
}

export const useConfirmStore = create<ConfirmState>(() => ({
  isOpen: false,
  message: "",
  resolve: null,
}));

/**
 * Promise-based replacement for window.confirm() that renders as the app's own styled dialog
 * (see ConfirmDialogHost, mounted once in App.tsx) instead of a jarring native browser prompt.
 * Usage: if (await confirmAction({ message: "Delete this?", danger: true })) mutate();
 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.setState({ ...options, isOpen: true, resolve });
  });
}
