"use client";

import { useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Small shared fetch-on-mount/deps-change hook — every page now fetches
 * from Postgres at runtime (there's no server to do it at request time on
 * GitHub Pages, and no static file to read at build time anymore, see
 * src/lib/players-data/remote.ts). Deliberately minimal: no cache, no
 * refetch-on-focus — this is a small internal tool, not a case that needs
 * a dependency like SWR/react-query.
 *
 * `deps` follows useEffect's rules — pass the values `fetcher` actually
 * depends on so it only reruns when they change, not the fetcher's own
 * (usually-new-every-render) identity.
 */
export function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  // Keeping "the fetcher to call" in a ref (updated inside the effect
  // below, never during render — react-hooks/refs) lets the effect always
  // call the latest closure without needing the fetcher's own,
  // usually-new-every-render identity in its dependency array.
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    let cancelled = false;
    // Resetting to "loading" synchronously here matches React's own
    // documented data-fetching effect pattern (see the "Fetching data"
    // example in the React docs) — flagged by the newer
    // react-hooks/set-state-in-effect rule as a stricter default, but
    // deliberately kept: every page in this app relies on `loading`
    // flipping back to true when `deps` change (a filter, a page number),
    // not just on first mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((prev) => ({ data: prev.data, loading: true, error: null }));
    fetcherRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ data: null, loading: false, error });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
