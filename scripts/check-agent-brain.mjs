import { readFile } from "node:fs/promises";

const [agents, claude] = await Promise.all([
  readFile("AGENTS.md", "utf8"),
  readFile("CLAUDE.md", "utf8"),
]);

if (agents !== claude) {
  console.error("AGENTS.md and CLAUDE.md differ. Keep the project brain identical.");
  process.exit(1);
}

console.log("Agent brain is synchronized.");
