// One username check per session token (spec E11). Kept apart from the pages so both the gate (Public.tsx) and the identity
// provider (which clears it after an account link, spec A9) can use it without a circular import. In memory only.
export const usernameChecked = new Map<string, "ok" | "needs">();
