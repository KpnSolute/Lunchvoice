import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { check, flowConsistency, generate, operations, schemas } from "../contract/src/assemble.mjs";
import { gateCases, gateMet } from "../contract/src/fixtures/data.mjs";
import { validate } from "../contract/validate.mjs";

const { doc, files } = generate();
const uuid = "00000000-0000-4000-8001-000000000001";

test("contract is structurally valid and fixtures/examples match their schemas", () => {
  assert.deepEqual(check(doc), []);
});

test("every operation has a status, milestone and module; blocked ones name a decision", () => {
  for (const op of operations) {
    assert.ok(op.status && op.milestone && op.module, op.id);
    if (op.status === "blocked-decision") assert.ok(op.decisions.length > 0, op.id);
  }
});

test("legacy operations are implemented; no v2 operation claims production", () => {
  for (const op of operations) {
    if (op.kind === "rpc-v2") assert.notEqual(op.status, "implemented", op.id);
    else assert.equal(op.status, "implemented", op.id);
  }
});

test("all 49 flows are reconciled both ways", () => {
  assert.deepEqual(flowConsistency(), []);
  assert.equal(Object.keys(doc["x-flow-map"]).length, 49);
});

test("generation is deterministic and covers every operation", () => {
  assert.deepEqual(generate().files, files);
  assert.equal(Object.keys(doc.paths).length, operations.length);
  for (const op of operations) assert.ok(files["types.ts"].includes(`${op.id}:`) || files["types.ts"].includes(`"${op.id}":`), op.id);
});

test("gate rule fixtures use integer arithmetic and leave M=0 undecided", () => {
  assert.equal(gateMet("starter", 100, 50), false);
  assert.equal(gateMet("starter", 100, 51), true);
  assert.equal(gateMet("team", 100, 19), false);
  assert.equal(gateMet("team", 100, 20), true);
  assert.equal(gateMet("team", 0, 0), null);
  for (const c of gateCases) assert.equal(c.met, gateMet(c.plan, c.eligible_members, c.unique_responders));
});

test("no fixture sets an unlimited limit or an invented policy value", () => {
  const parsed = JSON.parse(files["fixtures/entitlements.json"]);
  assert.ok(!/unlimited|Infinity/i.test(JSON.stringify(parsed.items.map((i) => i.data))));
  const team = parsed.items.find((i) => i.name === "entitlements.team-with-undecided").data;
  assert.equal(team.limits.pages.limit, null);
  assert.deepEqual(team.undecided, ["pages", "active_total"]);
});

test("analytics fixtures never show suppressed or withheld data as zero, and keep members and guests apart", () => {
  const items = JSON.parse(files["fixtures/analytics.json"]).items;
  assert.ok(items.length >= 3);
  for (const { name, data } of items) {
    for (const g of data.groups) {
      if (g.suppressed) assert.ok(g.n === null && g.value === null && g.reason, `${name}: suppressed group must be null with a reason`);
      else assert.ok(Number.isInteger(g.n), `${name}: shown group has an integer n`);
    }
    for (const side of Object.values(data.participants)) if (side.suppressed) assert.ok(side.n === null && side.reason, `${name}: suppressed total must be null with a reason`);
    assert.deepEqual(Object.keys(data.participants).sort(), ["guest", "member"], `${name}: member and guest are separate`);
    assert.ok(!("total_participants" in data), `${name}: no combined total`);
  }
  const anonymous = items.find((i) => i.name === "analytics.suppressed-example").data;
  assert.equal(anonymous.policy.status, "applied");
});

test("the analytics operation has exactly the restricted query shape and no export path is implemented", () => {
  const op = operations.find((o) => o.id === "lv_analytics_query");
  assert.deepEqual(Object.keys(schemas[op.request].properties).sort(), ["campaign_id", "metric", "question_id"]);
  for (const id of ["lv_analytics_export", "lv_analytics_embed_create", "lv_analytics_embed_revoke"]) {
    assert.equal(operations.find((o) => o.id === id).status, "blocked-decision", id);
  }
});


test("validator rejects wrong types, extra properties, missing fields and bad formats", () => {
  const c = schemas;
  assert.ok(validate(c.Membership, {}, c).length > 0);
  assert.ok(validate(c.Uuid, "nope", c).length > 0);
  assert.deepEqual(validate(c.Uuid, uuid, c), []);
  assert.ok(validate(c.Timestamp, "2026-13-45", c).length > 0);
  assert.ok(validate({ type: "object", properties: {}, additionalProperties: false }, { extra: 1 }, c).length > 0);
  assert.ok(validate({ type: "integer" }, 1.5, c).length > 0);
  assert.ok(validate({ oneOf: [{ type: "string" }, { type: "string" }] }, "x", c).length > 0);
});

test("a malformed envelope is rejected by the response schema", () => {
  const op = operations.find((o) => o.id === "lv_my_context");
  const schema = doc.paths[op.path].post.responses[200].content["application/json"].schema;
  assert.ok(validate(schema, { ok: true, request_id: "r" }, schemas).length > 0);
  assert.ok(validate(schema, { ok: false, error: { code: "not_a_code", message: "x" }, request_id: "r" }, schemas).length > 0);
});

test("every implemented-nonprod operation exists in a migration with exactly the contract's argument names", () => {
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const sql = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => fs.readFileSync(new URL(f, dir), "utf8")).join("\n");
  const functions = new Map();
  for (const m of sql.matchAll(/create (?:or replace )?function public\.(\w+)\(([^)]*)\)/g)) {
    functions.set(m[1], m[2].split(",").map((a) => a.trim().split(/\s+/)[0]).filter(Boolean).sort());
  }
  for (const op of operations.filter((o) => o.status === "implemented-nonprod")) {
    assert.ok(functions.has(op.id), `${op.id} has no migration`);
    const expected = op.request ? Object.keys(schemas[op.request].properties).sort() : [];
    assert.deepEqual(functions.get(op.id), expected, `${op.id} argument names differ from the contract`);
  }
});

test("operations with a migration are not marked proposed", () => {
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const sql = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => fs.readFileSync(new URL(f, dir), "utf8")).join("\n");
  for (const op of operations.filter((o) => o.kind === "rpc-v2")) {
    if (new RegExp(`function public\\.${op.id}\\(`).test(sql)) assert.equal(op.status, "implemented-nonprod", op.id);
  }
});

test("provisional choices are registered, tied to a decision, and surfaced on the operations they affect", () => {
  const register = doc["x-provisional-register"];
  assert.ok(register.length > 0);
  for (const entry of register) {
    assert.ok(entry.decisions.length > 0, entry.id);
    for (const id of entry.operations) assert.ok(doc.paths[`/rest/v1/rpc/${id}`].post["x-provisional"].includes(entry.id), `${id} must list ${entry.id}`);
  }
  assert.ok(files["PROVISIONAL.md"].includes("not approved production policy"));
  assert.ok(doc.paths["/rest/v1/rpc/lv_join_hub"].post["x-provisional"].includes("P-05"));
});

test("the capability catalog fixture matches the ids seeded by the roles migration", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/20261024000200_v2_roles_capabilities_owner_transfer.sql", import.meta.url), "utf8");
  const seeded = [...sql.matchAll(/\('([a-z]+\.[a-z_]+\.[a-z_]+)', '(administration|structure|community)', (\d+)\)/g)].map((m) => [m[1], m[2]]);
  const catalog = JSON.parse(files["fixtures/roles.json"]).items.find((i) => i.name === "capability-catalog").data.capabilities.map((c) => [c.id, c.category]);
  assert.equal(seeded.length, 27);
  assert.deepEqual(seeded, catalog);
  assert.ok(seeded.every(([id]) => !id.startsWith("hub.")));
});
