import { useCallback, useEffect, useState, type DependencyList } from "react";
import type { LvError, LvResult } from "./lvApi";

export interface LvState<T> {
  data: T | null;
  error: LvError | null;
  loading: boolean;
  reload: () => void;
}

// Runs one lv_api read and keeps {data,error,loading}. `fn` must be stable per `deps`.
export function useLv<T>(fn: () => Promise<LvResult<T>>, deps: DependencyList): LvState<T> {
  const [state, setState] = useState<{ data: T | null; error: LvError | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    void run().then((r) => {
      if (!live) return;
      if (r.ok) setState({ data: r as unknown as T, error: null, loading: false });
      else setState({ data: null, error: r.error, loading: false });
    });
    return () => { live = false; };
  }, [run, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}
