import { useEffect, useRef } from "react";
import { toast } from "@/lib/toast";

const DEBOUNCE_MS = 1500;

export function useDraftAutosave<T>({
  storageKey,
  enabled,
  restoreEnabled = true,
  getValues,
  onRestore,
  isEmpty,
  watchDep,
}: {
  storageKey: string;
  enabled: boolean;
  restoreEnabled?: boolean;
  getValues: () => T;
  onRestore: (data: T) => void;
  isEmpty?: (data: T) => boolean;
  /** Changing reference triggers a debounced save (e.g. form watch snapshot) */
  watchDep?: unknown;
}) {
  const restoredRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!restoreEnabled || restoredRef.current) return;
    restoredRef.current = true;

    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { savedAt: string; data: T };
      if (!parsed?.data) return;
      toast(`Draft found from ${new Date(parsed.savedAt).toLocaleString()}`, {
        action: {
          label: "Restore",
          onClick: () => onRestore(parsed.data),
        },
        duration: 8000,
      });
    } catch {
      /* ignore corrupt draft */
    }
  }, [storageKey, onRestore, restoreEnabled]);

  useEffect(() => {
    if (!enabled) return;

    function scheduleSave() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        try {
          const data = getValues();
          if (isEmpty?.(data)) return;
          localStorage.setItem(
            storageKey,
            JSON.stringify({ savedAt: new Date().toISOString(), data })
          );
        } catch {
          /* ignore quota errors */
        }
      }, DEBOUNCE_MS);
    }

    scheduleSave();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, getValues, isEmpty, storageKey, watchDep]);
}

export function clearDraftAutosave(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
}
