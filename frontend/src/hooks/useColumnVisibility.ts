import { useEffect, useState } from "react";

/** Matches the reference's "Column visibility" DataTable button - lets a user hide columns they
 * don't care about on a wide table (Suppliers alone has 26). Persisted per-table in localStorage
 * so the choice survives a reload; `storageKey` should be unique per list page (e.g. "suppliers"). */
export function useColumnVisibility(storageKey: string, allKeys: string[]) {
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(`columnVisibility:${storageKey}`);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(`columnVisibility:${storageKey}`, JSON.stringify([...hidden]));
    } catch {
      // Best-effort persistence only - a private window or blocked storage just resets on reload.
    }
  }, [storageKey, hidden]);

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function isVisible(key: string) {
    return !hidden.has(key);
  }

  return { isVisible, toggle, hidden, allKeys };
}
