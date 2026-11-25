import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");
const PKG = JSON.parse(await readFile(join(dirname(CLI), "..", "package.json"), "utf-8"));

async function project(files = {}) {
  const dir = await mkdtemp(join(tmpdir(), "rtlify-cli-"));
  for (const [name, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, name)), { recursive: true });
    await writeFile(join(dir, name), content);
  }
  return dir;
}

function run(cwd, ...args) {
  // HOME/USERPROFILE point into the temp project so the global skill never touches the real home.
  const env = { ...process.env, NO_COLOR: "1", HOME: cwd, USERPROFILE: cwd };
  delete env.FORCE_COLOR;
  return spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: "utf-8", input: "" });
}

const exists = (p) => stat(p).then(() => true, () => false);

test("--version prints package version", () => {
  const r = run(tmpdir(), "--version");
  assert.equal(r.stdout.trim(), PKG.version);
});

test("unknown command exits 1", () => {
  assert.equal(run(tmpdir(), "nope").status, 1);
});

test("check finds files and exits 1 on violations (issue #1)", async () => {
  const dir = await project({ "App.tsx": "const x = <div className=\"ml-4\" />;\n", "src/s.css": ".a { margin-left: 0 }\n" });
  try {
    const r = run(dir, "check");
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /App\.tsx/);
    assert.match(r.stdout, /src\/s\.css/);
    assert.match(r.stdout, /2 violations/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("check exits 0 when clean and 2 when there is nothing to scan", async () => {
  const clean = await project({ "App.tsx": "const x = <div className=\"ms-4\" />;\n" });
  const empty = await project({ "README.md": "hi" });
  try {
    assert.equal(run(clean, "check").status, 0);
    assert.equal(run(empty, "check").status, 2);
  } finally {
    await rm(clean, { recursive: true, force: true });
    await rm(empty, { recursive: true, force: true });
  }
});

test("check --json and path arguments", async () => {
  const dir = await project({ "a/A.tsx": "<div className=\"pl-2\" />\n", "b/B.tsx": "<div className=\"pr-2\" />\n" });
  try {
    const r = run(dir, "check", "a", "--json");
    assert.equal(r.status, 1);
    const report = JSON.parse(r.stdout);
    assert.equal(report.filesScanned, 1);
    assert.equal(report.violationCount, 1);
    assert.equal(report.violations[0].file, "a/A.tsx");
    assert.equal(report.violations[0].line, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("init writes rules, respects mode flags, and is idempotent", async () => {
  const dir = await project({ "CLAUDE.md": "# Project\n" });
  try {
    let r = run(dir, "init", "--i18n");
    assert.equal(r.status, 0, r.stderr);
    const rules = await readFile(join(dir, ".rtlify-rules.md"), "utf-8");
    assert.match(rules, /^<!-- rtlify:enforceI18n=true -->/);
    assert.match(await readFile(join(dir, "CLAUDE.md"), "utf-8"), /# Project\n\n# RTLify Rules/);
    assert.ok(await exists(join(dir, ".claude", "skills", "rtlify", "SKILL.md")));

    r = run(dir, "init");
    assert.match(r.stdout, /Already set up/);

    r = run(dir, "init", "--hardcoded");
    assert.match(await readFile(join(dir, ".rtlify-rules.md"), "utf-8"), /^<!-- rtlify:enforceI18n=false -->/);
    const claude = await readFile(join(dir, "CLAUDE.md"), "utf-8");
    assert.equal(claude.split("# RTLify Rules").length, 2, "pointer added once");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("init reads config from CRLF rules file", async () => {
  const dir = await project({ "AGENTS.md": "" });
  try {
    run(dir, "init", "--i18n");
    const p = join(dir, ".rtlify-rules.md");
    await writeFile(p, (await readFile(p, "utf-8")).replace(/\n/g, "\r\n"));
    const r = run(dir, "check", "--json");
    assert.equal(JSON.parse(r.stdout).mode, "i18n");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("init supports .clinerules directory, modern Cursor and Windsurf rules", async () => {
  const dir = await project({ ".clinerules/existing.md": "x", ".cursor/settings.json": "{}", ".windsurf/.keep": "" });
  try {
    const r = run(dir, "init");
    assert.equal(r.status, 0, r.stderr);
    assert.match(await readFile(join(dir, ".clinerules", "rtlify.md"), "utf-8"), /# RTLify Rules/);
    assert.match(await readFile(join(dir, ".cursor", "rules", "rtlify.mdc"), "utf-8"), /alwaysApply: true/);
    assert.match(await readFile(join(dir, ".windsurf", "rules", "rtlify.md"), "utf-8"), /trigger: always_on/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("init appends to legacy single-file configs", async () => {
  const dir = await project({ ".cursorrules": "be nice", ".clinerules": "rules" });
  try {
    run(dir, "init");
    assert.match(await readFile(join(dir, ".cursorrules"), "utf-8"), /be nice\n\n# RTLify Rules/);
    assert.match(await readFile(join(dir, ".clinerules"), "utf-8"), /rules\n\n# RTLify Rules/);
    assert.equal(await exists(join(dir, ".cursor")), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("init --editors selects targets and rejects unknown ones", async () => {
  const dir = await project();
  try {
    assert.equal(run(dir, "init", "--editors", "gemini,codex").status, 0);
    assert.ok(await exists(join(dir, "GEMINI.md")));
    assert.ok(await exists(join(dir, "AGENTS.md")));
    assert.equal(await exists(join(dir, "CLAUDE.md")), false);
    const bad = run(dir, "init", "--editors=vim");
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /Unknown editor/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("init never overwrites a customised /rtlify skill", async () => {
  const dir = await project({ "CLAUDE.md": "", ".claude/skills/rtlify/SKILL.md": "my custom skill" });
  try {
    run(dir, "init");
    assert.equal(await readFile(join(dir, ".claude", "skills", "rtlify", "SKILL.md"), "utf-8"), "my custom skill");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
