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

test("anonymous analytics default to an undecided policy with no groups", () => {
  const item = JSON.parse(files["fixtures/analytics.json"]).items.find((i) => i.name === "analytics.undecided").data;
  assert.equal(item.policy.status, "undecided");
  assert.equal(item.policy.min_cohort, null);
  assert.deepEqual(item.groups, []);
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
