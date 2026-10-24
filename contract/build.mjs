// Builds contract/generated/* from contract/src. `--check` fails if committed output is stale or invalid.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { check, generate } from "./src/assemble.mjs";

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "generated");
const checkOnly = process.argv.includes("--check");

const { doc, files } = generate();
const errors = check(doc);
if (errors.length) {
  console.error(`Contract invalid (${errors.length}):\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  process.exit(1);
}

if (checkOnly) {
  const stale = [];
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(out, rel);
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text) stale.push(rel);
  }
  if (stale.length) {
    console.error(`Generated contract is stale: ${stale.join(", ")}. Run: npm run contract:build`);
    process.exit(1);
  }
  console.log(`Contract ok: ${Object.keys(doc.paths).length} operations, ${Object.keys(doc.components.schemas).length} schemas, ${Object.keys(files).length} files up to date.`);
} else {
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(out, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  console.log(`Wrote ${Object.keys(files).length} files to contract/generated (${Object.keys(doc.paths).length} operations).`);
}
