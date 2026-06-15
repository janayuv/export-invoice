import { useState, useEffect, useCallback } from "react";

export interface AsyncListState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Shared async-list lifecycle for read-only list hooks: loads on mount,
 * tracks loading/error, and exposes `reload`. Entity-specific SQL stays in
 * the calling hook — pass a stable `loader` (wrap it in `useCallback`) that
 * returns the rows. Behavior mirrors the hand-rolled `loadList` it replaces:
 * `loading` starts `true`, each load flips it on then off in `finally`, and
 * errors are stringified into `error` while leaving prior data in place.
 */
export function useAsyncList<T>(loader: () => Promise<T[]>): AsyncListState<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await loader();
      setData(rows);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}
