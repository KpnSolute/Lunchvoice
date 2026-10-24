import { arr, bool, enm, int, nullable, obj, ref, str, ts } from "../lib.mjs";

/** Capabilities, custom roles, Owner operations, entitlements and participation gates. */
export const rolesEntitlementSchemas = {
  CapabilityCategory: enm(["administration", "structure", "community"]),
  Capability: obj({
    id: str({ pattern: "^[a-z]+(\\.[a-z_]+){2}$", description: "Dotted id, e.g. community.campaign.activate." }),
    category: ref("CapabilityCategory"),
    delegable: bool(),
  }),
  CapabilityCatalog: obj({
    capabilities: arr(ref("Capability")),
    owner_only: arr(str(), { description: "Operations that no role can grant (delete Hub, transfer ownership)." }),
  }),
  Role: obj({
    id: ref("Uuid"),
    hub_id: ref("Uuid"),
    name: str({ minLength: 1, maxLength: 40 }),
    icon: nullable(str({ maxLength: 64 })),
    capabilities: arr(str()),
    assigned_count: int({ minimum: 0 }),
  }),
  RoleList: obj({ hub_id: ref("Uuid"), roles: arr(ref("Role")), slots: ref("Slots") }),
  RoleCreateRequest: obj({ hub_id: ref("Uuid"), name: str({ minLength: 1, maxLength: 40 }), icon: nullable(str({ maxLength: 64 })), capabilities: arr(str()) }, ["icon"]),
  RoleUpdateRequest: obj(
    { role_id: ref("Uuid"), name: str({ minLength: 1, maxLength: 40 }), icon: nullable(str({ maxLength: 64 })), capabilities: arr(str()) },
    ["name", "icon", "capabilities"],
  ),
  RoleRefRequest: obj({ role_id: ref("Uuid") }),
  RoleAssignRequest: obj({ role_id: ref("Uuid"), account_id: ref("Uuid") }),
  RoleGroupRequest: obj({ role_id: ref("Uuid"), category: ref("CapabilityCategory"), enabled: bool() }),
  RoleCapabilityRequest: obj({ role_id: ref("Uuid"), capability: str(), enabled: bool() }),
  OwnerTransferStart: obj({ hub_id: ref("Uuid"), to_account_id: ref("Uuid") }),
  OwnerTransferOffer: obj({ offer_id: ref("Uuid"), hub_id: ref("Uuid"), to_account_id: ref("Uuid"), expires_at: ref("Timestamp") }),
  OwnerTransferRef: obj({ offer_id: ref("Uuid") }),
  OwnerTransferResult: obj({ hub_id: ref("Uuid"), owner_account_id: ref("Uuid") }),

  PlanCode: enm(["starter", "team", "campaign_starter", "campaign_plus", "manual"]),
  GrantSource: enm(["subscription", "seasonal", "manual", "synthetic"]),
  GrantSummary: obj({
    source: ref("GrantSource"),
    plan_code: ref("PlanCode"),
    valid_from: ref("Timestamp"),
    valid_to: nullable(ref("Timestamp")),
  }),
  EntitlementLimit: ref("Slots"),
  Entitlements: obj({
    hub_id: ref("Uuid"),
    plan_code: nullable(ref("PlanCode")),
    grants: arr(ref("GrantSummary")),
    limits: obj({
      roles: ref("Slots"),
      pages: ref("Slots"),
      active_total: ref("Slots"),
      active_survey: ref("Slots"),
    }),
    undecided: arr(str(), { description: "Limit names whose policy is still undecided (for example Team totals). Their limit is null." }),
  }),
  GateStatusRequest: obj({ hub_id: ref("Uuid"), mode: str() }, ["mode"]),
  GateStatus: obj({
    scope: str(),
    numerator: int({ minimum: 0 }),
    denominator: int({ minimum: 0 }),
    met: nullable({ type: "boolean" }),
    next_action: str(),
    policy_version: str(),
  }),
  ManualGrantRequest: obj({
    hub_id: ref("Uuid"),
    plan_code: ref("PlanCode"),
    valid_from: ref("Timestamp"),
    valid_to: nullable(ref("Timestamp")),
    reason: str({ minLength: 1 }),
  }),
};
export { ts };
