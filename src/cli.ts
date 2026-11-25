#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PATTERNS, collectFiles, scanContent, type Violation } from "./scanner.js";
import { MARKER, TARGETS, detectTargets, type Target } from "./targets.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = join(__dirname, "rules.md");
const RULES_FILE = ".rtlify-rules.md";
const CONFIG_COMMENT_RE = /^<!-- rtlify:enforceI18n=(true|false) -->\r?\n/;
const I18N_PLACEHOLDER = "<!-- RTLIFY_I18N_RULE -->";

function readVersion(): string {
  try {
    return JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8")).version;
  } catch {
    return "unknown";
  }
}
const VERSION = readVersion();

interface RtlifyConfig {
  enforceI18n: boolean;
}

// --- ANSI (disabled for NO_COLOR, non-TTY output, unless FORCE_COLOR) ---
const useColor = !process.env.NO_COLOR && (!!process.env.FORCE_COLOR || !!process.stdout.isTTY);
const ansi = (code: string) => (useColor ? code : "");
const RED = ansi("\x1b[31m");
const GREEN = ansi("\x1b[32m");
const YELLOW = ansi("\x1b[33m");
const CYAN = ansi("\x1b[36m");
const DIM = ansi("\x1b[2m");
const BOLD = ansi("\x1b[1m");
const RESET = ansi("\x1b[0m");

// --- Args ---
function flag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function flagValue(args: string[], name: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith(`--${name}=`)) return args[i].slice(name.length + 3);
    if (args[i] === `--${name}` && args[i + 1] && !args[i + 1].startsWith("-")) return args[i + 1];
  }
  return undefined;
}

function positionals(args: string[], valueFlags: string[] = []): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("-")) {
      if (valueFlags.includes(a.slice(2))) i++;
      continue;
    }
    out.push(a);
  }
  return out;
}

// --- Config (stored as comment in .rtlify-rules.md) ---
async function readRules(): Promise<string | null> {
  try { return await readFile(resolve(process.cwd(), RULES_FILE), "utf-8"); } catch { return null; }
}

async function readConfig(): Promise<RtlifyConfig> {
  const content = await readRules();
  const match = content?.match(CONFIG_COMMENT_RE);
  return { enforceI18n: match ? match[1] === "true" : false };
}

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => { rl.question(question, (a) => { rl.close(); res(a.trim().toLowerCase()); }); });
}

// --- Dynamic rule 6 ---
const RULE_6_I18N = `### 6. i18n Mode (Enforced)

**This project uses i18n.** All user-facing text MUST use translation functions.

**When writing new code:**
- Wrap ALL user-facing text in the project's translation function \`{t('key')}\`.
- Provide the translation JSON key-value pairs alongside the code.
- If the code already uses \`t()\`, leave it intact.

**When refactoring existing code with \`/rtlify\`:**
- Extract hardcoded Hebrew/Arabic strings into \`t('component.key')\` and generate the corresponding translation JSON entries.
- Fix RTL layout issues (logical CSS, icon flipping, \`<bdi>\` wrapping).

\`\`\`jsx
<button>{t('auth.login')}</button>
<p>{t('home.welcome')}</p>
\`\`\`
\`\`\`json
// he.json
{
  "auth": { "login": "התחברות" },
  "home": { "welcome": "ברוכים הבאים לאתר שלנו!" }
}
\`\`\``;

const RULE_6_HARDCODED = `### 6. Hardcoded Mode (No i18n)

**This project does NOT use i18n.** Write text inline in the target language.

**STRICT RULES:**
- NEVER use \`t()\`, \`useTranslation()\`, or any translation function — they are not set up in this project and will break the build.
- NEVER invent translation keys or create JSON locale files.
- Write Hebrew/Arabic/Persian text directly in JSX.
- Still apply \`<bdi>\` wrapping for embedded LTR content (numbers, English words, dates).
- If the code already uses \`t()\` in some places, leave those calls intact — do not add new ones.

\`\`\`jsx
<button>התחברות</button>
<p>ברוכים הבאים לאתר שלנו!</p>
<p>ההזמנה שלך <bdi>#12345</bdi> אושרה בהצלחה</p>
\`\`\``;

// --- Global /rtlify skill for Claude Code ---
const SKILL_MANAGED = "<!-- Managed by rtlify-ai. Delete this line to keep your own edits. -->";

const SKILL_CONTENT = `---
name: rtlify
description: Scan and fix RTL violations in the current project.
---
${SKILL_MANAGED}

When the user types \`/rtlify\`:
1. Run \`npx rtlify-ai check\` to find RTL violations
2. Fix every violation according to \`.rtlify-rules.md\` — CSS to logical, icons flipped, \`<bdi>\` tags added
3. Re-run \`npx rtlify-ai check\` to confirm zero violations
Never extract strings to \`t()\` unless the rules file explicitly says to. Never break the build.
If a flagged line is intentionally physical (e.g. a chart axis), add an \`// rtlify-ignore\` comment instead of changing it.
`;

// Skill written by rtlify-ai <= 0.3.x (no managed marker) — safe to upgrade.
const LEGACY_SKILL_CONTENT = `---
name: rtlify
description: Scan and fix RTL violations in the current project.
---

When the user types \`/rtlify\`:
1. Run \`npx rtlify-ai check\` to find RTL violations
2. Fix every violation according to \`.rtlify-rules.md\` — CSS to logical, icons flipped, \`<bdi>\` tags added
3. Re-run \`npx rtlify-ai check\` to confirm zero violations
Never extract strings to \`t()\` unless the rules file explicitly says to. Never break the build.
`;

type SkillResult = "installed" | "updated" | "unchanged" | "kept";

async function installGlobalSkill(): Promise<SkillResult> {
  const home = homedir();
  if (!home) return "unchanged";
  const skillDir = join(home, ".claude", "skills", "rtlify");
  const skillPath = join(skillDir, "SKILL.md");

  let existing: string | null = null;
  try { existing = await readFile(skillPath, "utf-8"); } catch {}
  if (existing === SKILL_CONTENT) return "unchanged";
  // Never overwrite a skill the user customised.
  if (existing !== null && !existing.includes(SKILL_MANAGED) && existing.replace(/\r\n/g, "\n") !== LEGACY_SKILL_CONTENT) return "kept";

  await mkdir(skillDir, { recursive: true });
  await writeFile(skillPath, SKILL_CONTENT, "utf-8");
  return existing === null ? "installed" : "updated";
}

// --- init ---
async function resolveMode(args: string[], hasRules: boolean): Promise<RtlifyConfig> {
  if (flag(args, "i18n")) return { enforceI18n: true };
  if (flag(args, "hardcoded")) return { enforceI18n: false };
  if (hasRules) return readConfig();
  if (!process.stdin.isTTY) return { enforceI18n: false };

  console.log("");
  console.log(`  ${BOLD}rtlify-ai${RESET} ${DIM}v${VERSION}${RESET}`);
  console.log("");
  console.log(`  ${BOLD}How do you handle translations?${RESET}`);
  console.log("");
  console.log(`    ${BOLD}1${RESET}  ${CYAN}Hardcoded${RESET}  — text written inline, no i18n library`);
  console.log(`    ${BOLD}2${RESET}  ${GREEN}i18n${RESET}       — uses react-i18next, next-intl, vue-i18n, etc.`);
  console.log("");
  const answer = await ask(`  ${BOLD}>${RESET} Mode ${DIM}[1/2, default: 1]${RESET} `);
  return { enforceI18n: answer === "2" };
}

async function resolveTargets(args: string[], cwd: string): Promise<Target[]> {
  const editors = flagValue(args, "editors");
  if (editors) {
    const ids = editors.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (ids.includes("all")) return TARGETS;
    const unknown = ids.filter((id) => !TARGETS.some((t) => t.id === id));
    if (unknown.length) throw new Error(`Unknown editor(s): ${unknown.join(", ")}. Valid: ${TARGETS.map((t) => t.id).join(", ")}, all`);
    return TARGETS.filter((t) => ids.includes(t.id));
  }

  const detected = await detectTargets(cwd);
  if (detected.length > 0) return detected;
  if (!process.stdin.isTTY) return TARGETS;

  console.log("");
  console.log(`  ${BOLD}Which AI editors do you use?${RESET} ${DIM}(comma-separated numbers, or Enter for all)${RESET}`);
  console.log("");
  TARGETS.forEach((t, i) => console.log(`    ${BOLD}${i + 1}${RESET}  ${t.label}`));
  console.log("");
  const picks = await ask(`  ${BOLD}>${RESET} Editors ${DIM}[1-${TARGETS.length}, default: all]${RESET} `);
  if (picks === "") return TARGETS;
  const chosen = picks
    .split(",")
    .map((s) => parseInt(s.trim(), 10) - 1)
    .filter((i) => i >= 0 && i < TARGETS.length)
    .map((i) => TARGETS[i]);
  return chosen.length > 0 ? chosen : TARGETS;
}

async function init(args: string[]) {
  const cwd = process.cwd();
  const existingRules = await readRules();
  const config = await resolveMode(args, existingRules !== null);
  const mode = config.enforceI18n ? "i18n" : "hardcoded";

  if (existingRules !== null && !flag(args, "i18n") && !flag(args, "hardcoded")) {
    console.log("");
    console.log(`  ${DIM}Config found in ${RULES_FILE} (${mode} mode) — use --i18n or --hardcoded to switch${RESET}`);
  }

  // Write the full rules file (single source of truth, includes config)
  const rulesTemplate = await readFile(RULES_PATH, "utf-8");
  const rule6 = config.enforceI18n ? RULE_6_I18N : RULE_6_HARDCODED;
  const rulesContent = `<!-- rtlify:enforceI18n=${config.enforceI18n} -->\n` + rulesTemplate.replace(I18N_PLACEHOLDER, rule6);
  const rulesWritten = existingRules?.replace(/\r\n/g, "\n") !== rulesContent;
  if (rulesWritten) await writeFile(resolve(cwd, RULES_FILE), rulesContent, "utf-8");

  // Point each editor at the rules file
  const targets = await resolveTargets(args, cwd);
  const updated: string[] = [];
  let skill: SkillResult = "unchanged";
  for (const target of targets) {
    const out = await target.resolve(cwd);
    let existing = "";
    try {
      if ((await stat(out.path)).isDirectory()) {
        console.log(`  ${YELLOW}!${RESET} Skipped ${target.label}: ${relative(cwd, out.path)} is a directory`);
        continue;
      }
      existing = await readFile(out.path, "utf-8");
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }

    if (!existing.includes(MARKER)) {
      await mkdir(dirname(out.path), { recursive: true });
      const separator = existing.length === 0 ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
      await writeFile(out.path, existing + separator + out.content, "utf-8");
      updated.push(`${target.label} ${DIM}(${relative(cwd, out.path).replace(/\\/g, "/")})${RESET}`);
    }

    if (target.id === "claude" && !flag(args, "no-skill")) skill = await installGlobalSkill();
  }

  if (updated.length === 0 && !rulesWritten && (skill === "unchanged" || skill === "kept")) {
    console.log("");
    console.log(`  ${GREEN}●${RESET} Already set up — nothing to update.`);
    console.log("");
    return;
  }

  console.log("");
  console.log(`  ${GREEN}${BOLD}RTLify initialized${RESET}`);
  console.log("");
  if (rulesWritten) console.log(`  ${GREEN}+${RESET} ${RULES_FILE} ${DIM}(rules + config)${RESET}`);
  for (const label of updated) console.log(`  ${GREEN}+${RESET} ${label}`);
  if (skill === "installed" || skill === "updated") console.log(`  ${GREEN}+${RESET} /rtlify ${DIM}(global Claude Code skill ${skill})${RESET}`);
  if (skill === "kept") console.log(`  ${DIM}  /rtlify skill has local edits — left untouched${RESET}`);
  console.log("");
  console.log(`  ${DIM}Mode${RESET}  ${config.enforceI18n ? `${GREEN}i18n${RESET}` : `${CYAN}hardcoded${RESET}`}`);
  console.log("");
  console.log(`  ${DIM}Next: ${RESET}${BOLD}npx rtlify-ai check${RESET}${DIM} to scan for violations${RESET}`);
  console.log("");
}

// --- check ---
function sanitizeForTerminal(s: string): string {
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}

const EXIT_VIOLATIONS = 1;
const EXIT_NO_FILES = 2;

async function check(args: string[]) {
  const cwd = process.cwd();
  const json = flag(args, "json");
  const config = await readConfig();
  const activePatterns = config.enforceI18n ? PATTERNS : PATTERNS.filter((p) => !p.i18nOnly);
  const mode = config.enforceI18n ? "i18n" : "hardcoded";
  const paths = positionals(args);

  const files = await collectFiles(cwd, paths.length ? paths : ["."]);
  const results: { file: string; violations: Violation[] }[] = [];
  for (const filePath of files) {
    const violations = scanContent(await readFile(filePath, "utf-8"), activePatterns);
    if (violations.length) results.push({ file: relative(cwd, filePath).replace(/\\/g, "/"), violations });
  }
  const total = results.reduce((n, r) => n + r.violations.length, 0);

  if (json) {
    const report = {
      version: VERSION,
      mode,
      filesScanned: files.length,
      violationCount: total,
      violations: results.flatMap((r) => r.violations.map((v) => ({ file: r.file, ...v }))),
    };
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    console.log("");
    console.log(`  ${BOLD}rtlify-ai check${RESET} ${DIM}(${mode} mode, ${files.length} file${files.length === 1 ? "" : "s"})${RESET}`);
    console.log("");
    if (files.length === 0) {
      console.log(`  ${YELLOW}No scannable files found${RESET} ${DIM}(js, ts, jsx, tsx, css, scss, vue, svelte, astro, html)${RESET}`);
      console.log("");
    }
    for (const r of results) {
      console.log(`  ${CYAN}${r.file}${RESET}`);
      for (const v of r.violations) {
        console.log(`    ${DIM}${String(v.line).padStart(4)}${RESET} ${YELLOW}${v.category}${RESET}`);
        console.log(`         ${DIM}${v.message}${RESET}`);
        console.log(`         ${RED}${sanitizeForTerminal(v.content)}${RESET}`);
      }
      console.log("");
    }
    if (files.length > 0 && total === 0) {
      console.log(`  ${GREEN}${BOLD}No violations found${RESET} ${DIM}— RTL-ready!${RESET}`);
      console.log("");
    } else if (total > 0) {
      console.log(`  ${RED}${BOLD}${total} violation${total === 1 ? "" : "s"}${RESET} ${DIM}across ${results.length} file${results.length === 1 ? "" : "s"}${RESET}`);
      console.log(`  ${DIM}Intentional? Add ${RESET}// rtlify-ignore${DIM} to the line.${RESET}`);
      console.log("");
    }
  }

  if (files.length === 0) process.exitCode = EXIT_NO_FILES;
  else if (total > 0) process.exitCode = EXIT_VIOLATIONS;
}

// --- fix ---
const FIX_PROMPT = `Scan all files in this project for RTL violations by running \`npx rtlify-ai check\`.
Fix every violation according to the rules in \`.rtlify-rules.md\`.
After fixing, re-run \`npx rtlify-ai check\` to confirm zero remaining violations.`;

function copyToClipboard(text: string): boolean {
  const candidates: [string, string[]][] =
    process.platform === "darwin" ? [["pbcopy", []]]
    : process.platform === "win32" ? [["clip", []]]
    : [["wl-copy", []], ["xclip", ["-selection", "clipboard"]], ["xsel", ["--clipboard", "--input"]]];
  for (const [cmd, cmdArgs] of candidates) {
    const r = spawnSync(cmd, cmdArgs, { input: text, stdio: ["pipe", "ignore", "ignore"], timeout: 3000 });
    if (!r.error && r.status === 0) return true;
  }
  return false;
}

function fix() {
  console.log("");
  console.log(`  ${BOLD}rtlify-ai fix${RESET}`);
  console.log("");
  console.log(`  ${DIM}Paste this prompt into your AI editor (Cursor, Windsurf, Cline, Copilot, etc.):${RESET}`);
  console.log("");
  console.log(`  ${DIM}${"─".repeat(60)}${RESET}`);
  console.log("");
  console.log(`  ${CYAN}${FIX_PROMPT.split("\n").join(`\n  `)}${RESET}`);
  console.log("");
  console.log(`  ${DIM}${"─".repeat(60)}${RESET}`);
  console.log("");
  console.log(`  ${DIM}Claude Code users: just type ${RESET}${BOLD}/rtlify${RESET}${DIM} instead.${RESET}`);
  console.log("");
  if (copyToClipboard(FIX_PROMPT)) {
    console.log(`  ${GREEN}Copied to clipboard!${RESET}`);
    console.log("");
  }
}

// --- help ---
function printUsage() {
  console.log("");
  console.log(`  ${BOLD}rtlify-ai${RESET} ${DIM}v${VERSION}${RESET}`);
  console.log(`  ${DIM}RTL-aware AI rules for frontend developers${RESET}`);
  console.log("");
  console.log(`  ${BOLD}Usage${RESET}`);
  console.log("");
  console.log(`    ${BOLD}init${RESET} ${DIM}[--i18n | --hardcoded] [--editors claude,cursor,...] [--no-skill]${RESET}`);
  console.log(`             Set up RTLify in this project (auto-detects editors)`);
  console.log(`    ${BOLD}check${RESET} ${DIM}[paths...] [--json]${RESET}`);
  console.log(`             Scan for RTL violations — exit 1 on violations, 2 if no files`);
  console.log(`    ${BOLD}fix${RESET}      Print (and copy) a fix prompt for any AI editor`);
  console.log(`    ${BOLD}help${RESET}     Show this message   ${BOLD}--version${RESET}  Print version`);
  console.log("");
  console.log(`  ${DIM}Editors${RESET}  ${TARGETS.map((t) => t.id).join(", ")}, all`);
  console.log(`  ${DIM}Ignore${RESET}   // rtlify-ignore · // rtlify-ignore-next-line · // rtlify-ignore-file`);
  console.log(`  ${DIM}Docs${RESET}     ${CYAN}https://github.com/idanlevi1/rtlify${RESET}`);
  console.log("");
}

// --- main ---
async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "init": return init(args);
    case "check": return check(args);
    case "fix": return fix();
    case "--version": case "-v": case "version": console.log(VERSION); return;
    case "help": case "--help": case "-h": case undefined: printUsage(); return;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exitCode = 1;
  }
}

main().catch((e: unknown) => {
  console.error(`${RED}Error:${RESET} ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
