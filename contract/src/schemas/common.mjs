import { ERROR_CODES, any, arr, bool, enm, int, nullable, obj, ref, str, ts, uuid } from "../lib.mjs";

/** Shared primitives, the error model and PostgREST transport errors. */
export const commonSchemas = {
  Uuid: uuid(),
  Timestamp: ts(),
  RequestId: str({ description: "Server-generated id echoed in every v2 response; quote it in support requests." }),
  Slug: str({
    minLength: 2,
    maxLength: 40,
    description:
      "Hub address segment (lunchvoice.com/{slug}). Matching is case-insensitive. Full naming and reserved-word rules are decision D-09 and are not defined here.",
  }),
  ErrorCode: enm(ERROR_CODES),
  Error: obj(
    {
      code: ref("ErrorCode"),
      message: str(),
      details: any("Machine-readable context, for example limit/used for lv_quota_exceeded or numerator/denominator for lv_gate_unmet."),
    },
    ["details"],
  ),
  LvFail: obj({ ok: { const: false }, error: ref("Error"), request_id: ref("RequestId") }),
  PostgrestError: obj({ code: str(), message: str(), details: nullable(str()), hint: nullable(str()) }, ["details", "hint"]),
  Empty: obj({}),
  Slots: obj({
    used: int({ minimum: 0 }),
    limit: nullable(int({ minimum: 0, description: "null means the limit is undecided (never treat as unlimited)." })),
  }),
  RoleRef: obj({ id: ref("Uuid"), name: str({ minLength: 1, maxLength: 40 }), icon: nullable(str({ maxLength: 64 })) }),
  Pagination: obj({ limit: int({ minimum: 1, maximum: 200 }), offset: int({ minimum: 0 }) }, ["limit", "offset"]),
  BoolResult: obj({ done: bool() }),
};
export { arr };
