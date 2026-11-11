// Session-expiry handling shared by the transport and the identity provider.
//
// LunchVoice sessions last at most one hour on purpose (compliance LC-04, LC-33: the bearer token sits in the browser).
// When one ends, PostgREST refuses the call with HTTP 401 and a JWT error instead of a {ok:false} envelope. Before this
// module the transport turned that into "lv_server_error" ("Something went wrong on our side"), the header kept showing
// the person as signed in, and nothing told them to sign in again.

export interface RpcErrorLike {
  message?: string;
  code?: string;
}

/** sessionStorage flag set when a session ends, so the sign-in page can explain why the person is there. */
export const SESSION_ENDED_FLAG = "lv.session-ended";

export const SESSION_ENDED_MESSAGE = "Your session ended. Sign in again.";

/**
 * True when the backend refused the bearer token itself: HTTP 401, a PostgREST JWT error code (PGRST301 invalid,
 * PGRST302 missing, PGRST303 expired) or a JWT message. A 403 is deliberately not matched: that is a permission
 * problem for a valid session, not an ended one.
 */
export function isAuthFailure(error: RpcErrorLike | null | undefined, status?: number): boolean {
  if (!error) return false;
  if (status === 401) return true;
  if (error.code === "PGRST301" || error.code === "PGRST302" || error.code === "PGRST303") return true;
  return /\bjwt\b/i.test(error.message ?? "") && /(expired|invalid|malformed|signature)/i.test(error.message ?? "");
}

export type SessionEndedResult = { ok: false; error: { code: "lv_unauthenticated"; message: string } };

/**
 * What to do with a failed RPC: an ended session becomes an ordinary {ok:false, lv_unauthenticated} result (and
 * `onAuthFailure` fires if a token had actually been sent); anything else is a genuine fault and is thrown.
 */
export function rpcFailure(
  error: RpcErrorLike,
  status: number | undefined,
  hadToken: boolean,
  onAuthFailure?: () => void,
): SessionEndedResult {
  if (isAuthFailure(error, status)) {
    if (hadToken) onAuthFailure?.();
    return { ok: false, error: { code: "lv_unauthenticated", message: SESSION_ENDED_MESSAGE } };
  }
  throw new Error(error.message ?? "Request failed");
}
