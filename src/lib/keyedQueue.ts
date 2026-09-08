/**
 * Per-key write serialization — used by app-store.tsx so two writes
 * targeting the same entity (e.g. the same player's scouting notes, or the
 * same shortlist) never race over the network. Each call for a given key
 * waits for the previous one to *settle* (success or failure) before its
 * own request fires, so writes always reach the database in the same
 * order they were made, and the last call always wins — no accidental
 * overwrite from an earlier, slower request resolving after a later one.
 * Calls for different keys are fully independent (no cross-entity
 * blocking).
 */
export function createKeyedQueue<K extends string>() {
  const tails = new Map<K, Promise<unknown>>();

  return function enqueue<T>(key: K, run: () => Promise<T>): Promise<T> {
    const prior = tails.get(key) ?? Promise.resolve();
    const settledPrior = prior.then(
      () => undefined,
      () => undefined
    );
    const result = settledPrior.then(run);
    tails.set(
      key,
      result.then(
        () => undefined,
        () => undefined
      )
    );
    return result;
  };
}
