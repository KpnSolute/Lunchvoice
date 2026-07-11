import { execFileSync } from "node:child_process";

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8" }).trim();

const versionPattern = /^v(\d+)\.(\d+)\.(\d+)$/;

function nextVersion(version) {
  let [major, minor, patch] = version;
  patch += 1;
  if (patch > 9) {
    patch = 0;
    minor += 1;
  }
  if (minor > 9) {
    minor = 0;
    major += 1;
  }
  return [major, minor, patch];
}

function releaseClass([, minor, patch]) {
  if (minor === 9) return "main";
  if (patch === 9) return "prerelease";
  return "normal";
}

function changedFiles(commit) {
  return git("diff-tree", "--root", "--no-commit-id", "--name-only", "-r", commit)
    .split(/\r?\n/)
    .filter(Boolean);
}

function needsHeavyTests(version, files) {
  if (releaseClass(version) !== "normal") return true;
  return files.some((file) =>
    /^(package(-lock)?\.json|render\.yaml|supabase\/(migrations|functions)\/|src\/(contexts\/Auth|lib\/supabase)|\.github\/workflows\/)/.test(file),
  );
}

const tags = git("tag", "--merged", "HEAD", "--list", "v[0-9]*.[0-9]*.[0-9]*", "--sort=-version:refname")
  .split(/\r?\n/)
  .filter((tag) => versionPattern.test(tag));
const latestTag = tags[0];
let version = latestTag
  ? latestTag.match(versionPattern).slice(1).map(Number)
  : [0, 0, 0];
const commits = latestTag
  ? git("rev-list", "--reverse", "--first-parent", `${latestTag}..HEAD`).split(/\r?\n/).filter(Boolean)
  : [git("rev-parse", "HEAD")];

if (process.argv[2] === "check") {
  for (const commit of commits) {
    if (!changedFiles(commit).includes("CHANGELOG.md")) {
      console.error(`${commit.slice(0, 7)} does not update CHANGELOG.md.`);
      process.exitCode = 1;
    }
  }
  if (!process.exitCode) console.log("Every pending release commit updates CHANGELOG.md.");
} else if (process.argv[2] === "plan") {
  for (const commit of commits) {
    version = nextVersion(version);
    const tag = `v${version.join(".")}`;
    console.log([commit, tag, releaseClass(version), needsHeavyTests(version, changedFiles(commit))].join("\t"));
  }
} else {
  console.error("Usage: node scripts/release-policy.mjs <check|plan>");
  process.exit(2);
}
