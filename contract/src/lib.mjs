// Tiny schema DSL for the LunchVoice API contract.
//
// The contract is authored here (JavaScript, no dependencies) and emitted as
// openapi.json, types.ts and fixtures/*.json by contract/build.mjs. Only the
// JSON Schema subset below is used, so the generator and the validator in
// validate.mjs stay small and fully tested:
//   type, enum, const, properties, required, additionalProperties, items,
//   oneOf, $ref, format (uuid, date-time, date), minimum, maximum,
//   minLength, maxLength, pattern, minItems, maxItems.

export const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

export const str = (extra = {}) => ({ type: "string", ...extra });
export const int = (extra = {}) => ({ type: "integer", ...extra });
export const num = (extra = {}) => ({ type: "number", ...extra });
export const bool = () => ({ type: "boolean" });
export const any = (description) => (description ? { description } : {});
export const cnst = (value) => ({ const: value });
export const enm = (values, extra = {}) => ({ type: "string", enum: values, ...extra });
export const uuid = () => ({ type: "string", format: "uuid" });
export const ts = () => ({ type: "string", format: "date-time" });
export const date = () => ({ type: "string", format: "date" });

export const arr = (items, extra = {}) => ({ type: "array", items, ...extra });

/** Object with every property required except those named in `optional`. */
export function obj(properties, optional = [], extra = {}) {
  const required = Object.keys(properties).filter((key) => !optional.includes(key));
  const schema = { type: "object", properties, additionalProperties: false, ...extra };
  if (required.length > 0) schema.required = required;
  return schema;
}

/** Nullable variant of a schema (works for $ref, primitives and enums). */
export function nullable(schema) {
  if (schema.$ref) return { oneOf: [schema, { type: "null" }] };
  if (typeof schema.type === "string") {
    const next = { ...schema, type: [schema.type, "null"] };
    if (schema.enum) next.enum = [...schema.enum, null];
    return next;
  }
  return { oneOf: [schema, { type: "null" }] };
}

export const oneOf = (...schemas) => ({ oneOf: schemas });

/** Error codes shared by every v2 operation. Keep in sync with docs/backend/API_AND_AUTHORIZATION_CONTRACTS.md. */
export const ERROR_CODES = [
  "lv_unauthenticated",
  "lv_forbidden",
  "lv_not_member",
  "lv_not_found",
  "lv_hub_mismatch",
  "lv_quota_exceeded",
  "lv_gate_unmet",
  "lv_entitlement_missing",
  "lv_lifecycle_invalid",
  "lv_conflict",
  "lv_policy_undecided",
  "lv_rate_limited",
  "lv_invalid_input",
];

export const OP_STATUSES = [
  "implemented", // live in production today (legacy v1 surface)
  "implemented-nonprod", // implemented in a reviewed migration/PR, not applied to production
  "proposed", // specified here, not built
  "blocked-decision", // cannot be built until a founder decision (see x-decisions)
];

export const MODULES = [
  "identity",
  "hubs",
  "roles",
  "entitlements",
  "campaigns",
  "participation",
  "analytics",
  "pages",
  "growth",
  "billing",
  "connectors",
  "legacy",
];

export const MILESTONES = ["M1", "M2", "TBD", "legacy"];
