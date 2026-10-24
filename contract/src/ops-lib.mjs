// Operation declaration helpers.
//
// v2 operations are Postgres functions exposed through PostgREST (POST /rest/v1/rpc/<id>) and return the
// envelope { ok, data, request_id } | { ok:false, error, request_id } with HTTP 200; transport and gateway
// failures use PostgREST errors. This keeps the contract implementable on the existing stack and portable to
// a future API service (decision D-14) without changing the schemas.

/**
 * @typedef {Object} V2Op
 * @property {string} id operationId and function name, snake_case with lv_ prefix
 * @property {string} module one of MODULES
 * @property {string} status one of OP_STATUSES
 * @property {string} milestone M1 | M2 | TBD
 * @property {string[]} flows frontend flow ids (F-01..F-49) this operation serves
 * @property {string} summary one line
 * @property {string|null} request request schema name, or null for no arguments
 * @property {string} data schema name of `data` in the success envelope
 * @property {string[]} errors error codes this operation can return
 * @property {'anon'|'user'|'service'} auth minimum caller
 * @property {string[]} [capabilities] capability ids required (checked server-side)
 * @property {string[]} [decisions] open decision ids that gate or shape the operation
 * @property {boolean} [idempotent] accepts idempotency_key and replays the first result
 * @property {string} [note] extra behaviour notes
 */

/** @param {V2Op} def */
export function v2(def) {
  return { kind: "rpc-v2", method: "post", path: `/rest/v1/rpc/${def.id}`, capabilities: [], decisions: [], idempotent: false, ...def };
}

/** Legacy RPC called through PostgREST with its native (non-envelope) result. */
export function legacyRpc(def) {
  return { kind: "rpc-legacy", method: "post", path: `/rest/v1/rpc/${def.id}`, module: "legacy", status: "implemented", milestone: "legacy", capabilities: [], decisions: [], ...def };
}

/** Legacy Edge Function with native JSON bodies. */
export function edge(def) {
  return { kind: "edge", method: "post", path: `/functions/v1/${def.id}`, module: "legacy", status: "implemented", milestone: "legacy", capabilities: [], decisions: [], ...def };
}
