import { ERROR_CODES, MILESTONES, MODULES, OP_STATUSES } from "./lib.mjs";
import { FLOWS } from "./flows.mjs";
import { commonSchemas } from "./schemas/common.mjs";
import { identityHubSchemas } from "./schemas/identity-hubs.mjs";
import { rolesEntitlementSchemas } from "./schemas/roles-entitlements.mjs";
import { campaignSchemas } from "./schemas/campaigns-participation.mjs";
import { laterSchemas, legacySchemas } from "./schemas/later-legacy.mjs";
import { identityOps, hubOps } from "./ops/identity-hubs.mjs";
import { roleOps, entitlementOps } from "./ops/roles-entitlements.mjs";
import { campaignOps, participationOps, analyticsOps } from "./ops/campaigns-participation.mjs";
import { laterOps, legacyOps } from "./ops/later-legacy.mjs";
import { fixtureFiles, examples } from "./fixtures/index.mjs";
import { generateTypes } from "./to-typescript.mjs";
import { PROVISIONAL } from "./provisional.mjs";
import { checkDocument, validate } from "../validate.mjs";

export const CONTRACT_VERSION = "0.8.0";

export const operations = [
  ...identityOps, ...hubOps, ...roleOps, ...entitlementOps, ...campaignOps, ...participationOps, ...analyticsOps, ...laterOps, ...legacyOps,
];

export const schemas = {
  ...commonSchemas, ...identityHubSchemas, ...rolesEntitlementSchemas, ...campaignSchemas, ...laterSchemas, ...legacySchemas,
};

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const okEnvelope = (data) => ({
  type: "object",
  properties: { ok: { const: true }, data: ref(data), request_id: ref("RequestId") },
  required: ["ok", "data", "request_id"],
  additionalProperties: false,
});
const legacyError = { type: "object", properties: { error: { type: "string" } }, additionalProperties: true };

function security(op) {
  if (op.auth === "service") return [{ apikey: [], serviceRole: [] }];
  if (op.auth === "user") return [{ apikey: [], userJwt: [] }];
  return [{ apikey: [] }];
}

function buildOperation(op) {
  const out = {
    operationId: op.id,
    summary: op.summary,
    tags: [op.module],
    "x-module": op.module,
    "x-status": op.status,
    "x-milestone": op.milestone,
    "x-flows": op.flows ?? [],
    "x-capabilities": op.capabilities ?? [],
    "x-decisions": op.decisions ?? [],
    "x-auth": op.auth,
    "x-provisional": PROVISIONAL.filter((p) => p.ops.includes(op.id)).map((p) => p.id),
    security: security(op),
  };
  if (op.note) out.description = op.note;
  if (op.kind === "rpc-v2") {
    out["x-idempotent"] = Boolean(op.idempotent);
    out["x-errors"] = op.errors ?? [];
    out.responses = {
      200: { description: "Envelope: success, or a failure with a stable error code.", content: { "application/json": { schema: { oneOf: [okEnvelope(op.data), ref("LvFail")] } } } },
      "4XX": { description: "Transport or gateway error (PostgREST).", content: { "application/json": { schema: ref("PostgrestError") } } },
    };
  } else {
    out.responses = { 200: { description: "Native result.", content: { "application/json": { schema: ref(op.success) } } } };
    for (const status of op.statuses ?? []) out.responses[String(status)] = { description: "Error.", content: { "application/json": { schema: legacyError } } };
  }
  if (op.request) out.requestBody = { required: true, content: { "application/json": { schema: ref(op.request) } } };
  return out;
}

export function buildOpenApi() {
  const paths = {};
  for (const op of operations) paths[op.path] = { [op.method]: buildOperation(op) };
  const flowIndex = {};
  for (const [id, f] of Object.entries(FLOWS)) {
    flowIndex[id] = { name: f.name, operations: f.ops ?? [], ...(f.client ? { client: f.client } : {}), ...(f.external ? { external: f.external } : {}), ...(f.legacyData ? { legacyData: f.legacyData } : {}), ...(f.blocked ? { blocked: f.blocked } : {}) };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "LunchVoice API",
      version: CONTRACT_VERSION,
      description: "Machine-readable contract for LunchVoice. v2 operations are Postgres functions behind PostgREST RPC returning a 200 envelope; legacy operations are the live v1 surface. Per-operation x-status says whether it exists: implemented (production), implemented-nonprod, proposed, blocked-decision. A null limit means undecided, never unlimited.",
    },
    servers: [{ url: "https://{project}.supabase.co", variables: { project: { default: "qprfonxvthmaoxfixigk" } } }],
    tags: MODULES.map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        apikey: { type: "apiKey", in: "header", name: "apikey", description: "Publishable (anon) key." },
        userJwt: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Supabase Auth access token." },
        serviceRole: { type: "http", scheme: "bearer", description: "Server-side only. Never ship to a browser." },
      },
      schemas,
    },
    "x-flow-map": flowIndex,
    "x-provisional-register": PROVISIONAL.map((p) => ({ id: p.id, decisions: p.decisions, operations: p.ops, summary: p.summary })),
  };
}

/** Cross-checks flows <-> operations in both directions. */
export function flowConsistency() {
  const errors = [];
  const byId = new Map(operations.map((o) => [o.id, o]));
  for (const op of operations) {
    for (const f of op.flows ?? []) if (!(FLOWS[f]?.ops ?? []).includes(op.id)) errors.push(`${op.id} declares ${f} but FLOWS[${f}].ops does not list it`);
  }
  for (const [f, entry] of Object.entries(FLOWS)) {
    for (const id of entry.ops ?? []) if (byId.has(id) && !(byId.get(id).flows ?? []).includes(f)) errors.push(`FLOWS[${f}] lists ${id} but the operation does not declare ${f}`);
  }
  return errors;
}

export function check(doc) {
  const errors = [...checkDocument(doc, { flowMap: FLOWS, modules: MODULES, statuses: OP_STATUSES, milestones: MILESTONES, errorCodes: ERROR_CODES }), ...flowConsistency()];
  const components = doc.components.schemas;

  const opIds = new Set(operations.map((o) => o.id));
  const seen = new Set();
  for (const p of PROVISIONAL) {
    if (seen.has(p.id)) errors.push(`provisional ${p.id} is duplicated`);
    seen.add(p.id);
    if (!p.decisions.length) errors.push(`provisional ${p.id} must name the decision it depends on`);
    for (const id of p.ops) if (!opIds.has(id)) errors.push(`provisional ${p.id} names unknown operation ${id}`);
  }

  for (const [file, spec] of Object.entries(fixtureFiles)) {
    for (const item of spec.items) {
      if (spec.raw) continue;
      if (!components[item.schema]) errors.push(`fixtures/${file}:${item.name}: unknown schema ${item.schema}`);
      else errors.push(...validate(components[item.schema], item.data, components).map((e) => `fixtures/${file}:${item.name}: ${e}`));
    }
  }

  const byId = new Map(operations.map((o) => [o.id, o]));
  for (const ex of examples) {
    const op = byId.get(ex.operationId);
    const label = `examples:${ex.operationId}/${ex.name}`;
    if (!op || op.kind !== "rpc-v2") { errors.push(`${label}: unknown v2 operation`); continue; }
    if (op.request) errors.push(...validate(components[op.request], ex.request, components).map((e) => `${label} request: ${e}`));
    else if (Object.keys(ex.request).length) errors.push(`${label}: operation takes no request`);
    const responseSchema = { oneOf: [okEnvelope(op.data), ref("LvFail")] };
    errors.push(...validate(responseSchema, ex.response, components).map((e) => `${label} response: ${e}`));
    if (ex.response.ok === false && !op.errors.includes(ex.response.error.code)) errors.push(`${label}: code ${ex.response.error.code} not declared in the operation's errors`);
  }
  return errors;
}

const json = (v) => `${JSON.stringify(v, null, 2)}\n`;

/** Returns { relativePath: contents } for every generated file. */
export function generate() {
  const doc = buildOpenApi();
  const files = {
    "openapi.json": json(doc),
    "types.ts": generateTypes(doc, operations),
    "examples.json": json({ version: CONTRACT_VERSION, description: "Request/response pairs for mock adapters and contract tests. Synthetic data only.", examples }),
    "operations.json": json(
      operations.map((o) => ({ id: o.id, kind: o.kind, module: o.module, status: o.status, milestone: o.milestone, path: o.path, auth: o.auth, flows: o.flows ?? [], capabilities: o.capabilities ?? [], decisions: o.decisions ?? [] })),
    ),
  };
  files["provisional.json"] = json({ version: CONTRACT_VERSION, description: "Provisional implementation choices. NOT approved production policy.", items: PROVISIONAL });
  files["PROVISIONAL.md"] = [
    "<!-- GENERATED by contract/build.mjs from contract/src/provisional.mjs. Do not edit. -->",
    "# Provisional implementation choices",
    "",
    "These behaviours exist so the system is usable and testable. They are **not approved production policy**; merging",
    "the migration that implements one does not approve it. Record the decision in the decision register before any of",
    "this reaches production.",
    "",
    "| Id | Depends on | Operations | Choice |",
    "| --- | --- | --- | --- |",
    ...PROVISIONAL.map((p) => `| ${p.id} | ${p.decisions.join(", ")} | ${p.ops.map((o) => `\`${o}\``).join(", ")} | ${p.summary} |`),
    "",
  ].join("\n");
  for (const [name, spec] of Object.entries(fixtureFiles)) {
    files[`fixtures/${name}`] = json(spec.raw ? { version: CONTRACT_VERSION, description: spec.description, cases: spec.items } : { version: CONTRACT_VERSION, description: spec.description, items: spec.items });
  }
  return { doc, files };
}
