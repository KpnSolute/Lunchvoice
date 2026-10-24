// Dependency-free validator for the JSON Schema subset used by the contract (see src/lib.mjs).
// Used to check fixtures and examples against the generated OpenAPI document, and by tests.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value; // string, number, boolean, object
}

function typeMatches(declared, actual) {
  if (declared === actual) return true;
  return declared === "number" && actual === "integer";
}

/**
 * Validate `value` against `schema`, resolving $ref against `components` (a map of schema name to schema).
 * Returns an array of human-readable error strings (empty when valid).
 */
export function validate(schema, value, components, path = "$") {
  const errors = [];
  if (schema.$ref) {
    const name = schema.$ref.replace("#/components/schemas/", "");
    const target = components[name];
    if (!target) return [`${path}: unresolved $ref ${schema.$ref}`];
    return validate(target, value, components, path);
  }

  if (schema.oneOf) {
    const results = schema.oneOf.map((option) => validate(option, value, components, path));
    const matches = results.filter((r) => r.length === 0).length;
    if (matches !== 1) {
      errors.push(`${path}: expected exactly one oneOf option to match, ${matches} matched`);
      if (matches === 0) errors.push(...results.map((r, i) => `  option ${i}: ${r[0] ?? "ok"}`));
    }
    return errors;
  }

  if ("const" in schema && value !== schema.const) errors.push(`${path}: expected constant ${JSON.stringify(schema.const)}`);

  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);

  if (schema.type) {
    const declared = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    if (!declared.some((t) => typeMatches(t, actual))) {
      errors.push(`${path}: expected ${declared.join("|")}, got ${actual}`);
      return errors;
    }
  }

  if (typeof value === "string") {
    if (schema.format === "uuid" && !UUID.test(value)) errors.push(`${path}: not a uuid`);
    if (schema.format === "date-time" && (!DATE_TIME.test(value) || Number.isNaN(Date.parse(value)))) errors.push(`${path}: not an RFC 3339 date-time`);
    if (schema.format === "date" && (!DATE.test(value) || Number.isNaN(Date.parse(value)))) errors.push(`${path}: not a date`);
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: longer than ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: does not match ${schema.pattern}`);
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above maximum ${schema.maximum}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: more than ${schema.maxItems} items`);
    if (schema.items) value.forEach((item, i) => errors.push(...validate(schema.items, item, components, `${path}[${i}]`)));
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const props = schema.properties ?? {};
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${path}: missing required property "${key}"`);
    for (const [key, v] of Object.entries(value)) {
      if (props[key]) errors.push(...validate(props[key], v, components, `${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}: unexpected property "${key}"`);
    }
  }
  return errors;
}

/** Structural checks on a generated OpenAPI document. Returns error strings. */
export function checkDocument(doc, { flowMap, modules, statuses, milestones, errorCodes }) {
  const errors = [];
  const names = new Set(Object.keys(doc.components.schemas));
  const seenIds = new Set();

  const refs = [];
  const walk = (node, where) => {
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${where}[${i}]`));
    if (node && typeof node === "object") {
      if (typeof node.$ref === "string") refs.push([node.$ref, where]);
      for (const [k, v] of Object.entries(node)) walk(v, `${where}.${k}`);
    }
  };
  walk(doc, "$");
  for (const [target, where] of refs) {
    const name = target.replace("#/components/schemas/", "");
    if (!target.startsWith("#/components/schemas/") || !names.has(name)) errors.push(`${where}: unresolved reference ${target}`);
  }

  for (const [path, item] of Object.entries(doc.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      const id = operation.operationId;
      if (!id) errors.push(`${method.toUpperCase()} ${path}: missing operationId`);
      if (seenIds.has(id)) errors.push(`duplicate operationId ${id}`);
      seenIds.add(id);
      if (!statuses.includes(operation["x-status"])) errors.push(`${id}: bad x-status ${operation["x-status"]}`);
      if (!milestones.includes(operation["x-milestone"])) errors.push(`${id}: bad x-milestone ${operation["x-milestone"]}`);
      if (!modules.includes(operation["x-module"])) errors.push(`${id}: bad x-module ${operation["x-module"]}`);
      for (const code of operation["x-errors"] ?? []) if (!errorCodes.includes(code)) errors.push(`${id}: unknown error code ${code}`);
      for (const flow of operation["x-flows"] ?? []) if (!(flow in flowMap)) errors.push(`${id}: unknown flow ${flow}`);
      if (operation["x-status"] === "blocked-decision" && (operation["x-decisions"] ?? []).length === 0) errors.push(`${id}: blocked-decision needs x-decisions`);
    }
  }

  for (const [flow, entry] of Object.entries(flowMap)) {
    const classified = entry.ops?.length || entry.client || entry.external || entry.legacyData || entry.blocked;
    if (!classified) errors.push(`${flow}: not classified (no operations, client, external, legacyData or blocked)`);
    for (const id of entry.ops ?? []) if (!seenIds.has(id)) errors.push(`${flow}: references unknown operation ${id}`);
  }
  if (Object.keys(flowMap).length !== 49) errors.push(`expected 49 flows, found ${Object.keys(flowMap).length}`);
  for (let n = 1; n <= 49; n += 1) {
    const id = `F-${String(n).padStart(2, "0")}`;
    if (!(id in flowMap)) errors.push(`${id}: missing from the flow map`);
  }
  return errors;
}
