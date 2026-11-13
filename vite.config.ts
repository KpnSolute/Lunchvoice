import { execFileSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Build identity for the "new version available" notice (src/components/UpdateNotice.tsx). The app embeds its own
// id; /version.json carries the id of whatever is live now. It is meant to be served no-store, but production does not
// carry that rule yet (render.yaml is not connected to Render; see docs/ops/SERVICES_AND_DEPENDENCIES.md section 2a).
function gitId(): string {
  const fromEnv = process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv.slice(0, 12);
  try { return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return "local"; }
}

const buildId = `${gitId()}-${Date.now().toString(36)}`; // unique even for repeat builds of one commit
const builtAt = new Date().toISOString();

function versionFile(): Plugin {
  return {
    name: "lv-version-file",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ id: buildId, builtAt }) + "\n" });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), versionFile()],
  // Dev serves no /version.json (the SPA fallback is not a version file), so it never looks outdated on its own; e2e fakes one.
  define: { __LV_BUILD_ID__: JSON.stringify(command === "build" ? buildId : "dev") },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
}));
