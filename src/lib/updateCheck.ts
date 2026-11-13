// Pure rules for the "new version available" notice, kept free of React and globals so they are unit-tested.

export const POLL_MS = 5 * 60_000;
export const MAX_POLL_MS = 30 * 60_000;

/** Delay before the next poll: the normal interval, doubling after each failure, capped. */
export function nextDelay(failures: number): number {
  return Math.min(MAX_POLL_MS, POLL_MS * 2 ** Math.max(0, failures));
}

/** The id inside a /version.json body, or null when the body is not a version file (e.g. an HTML fallback). */
export function parseVersion(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const id = (body as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 && id.length <= 64 ? id : null;
}

/** A newer deploy is live when the file names a different build. Dev builds never compare. */
export function isNewer(current: string, latest: string | null): boolean {
  return !!latest && current !== "local" && current !== latest;
}

/** Errors a browser throws when a lazy route chunk no longer exists after a deploy. */
export function isChunkLoadError(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : typeof e === "string" ? e : "";
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed|ChunkLoadError/i.test(msg);
}
