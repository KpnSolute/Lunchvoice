/**
 * Supabase API keys go in the `apikey` header only; `Authorization` carries a person's token or nothing (Supabase API
 * keys guide: publishable keys are not JWTs, and anything that verifies one as a JWT fails). supabase-js copies the key
 * into `Authorization: Bearer` when no one is signed in, so this fetch removes that copy and leaves real tokens alone.
 */
export function keyOnlyInApikey(apiKey: string, base: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (headers.get("authorization") === `Bearer ${apiKey}`) headers.delete("authorization");
    return base(input, { ...init, headers });
  };
}
