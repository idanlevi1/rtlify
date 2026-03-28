#!/usr/bin/env node

import { readFile, writeFile, readdir, mkdir, realpath } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = join(__dirname, "rules.md");
const RULES_FILE = ".rtlify-rules.md";
const CONFIG_COMMENT_RE = /^<!-- rtlify:enforceI18n=(true|false) -->\n/;
const MARKER = "# RTLify Rules";
const I18N_PLACEHOLDER = "<!-- RTLIFY_I18N_RULE -->";

interface RtlifyConfig {
  enforceI18n: boolean;
}

interface Target {
  file: string;
  dir?: string;
  label: string;
  detect: string[]; // files/dirs whose existence signals this editor is in use
}

const TARGET_FILES: Target[] = [
  { file: "CLAUDE.md", label: "Claude Code", detect: [".claude", "CLAUDE.md"] },
  { file: ".cursorrules", label: "Cursor", detect: [".cursorrules", ".cursor"] },
  { file: ".windsurfrules", label: "Windsurf", detect: [".windsurfrules"] },
  { file: ".clinerules", label: "Cline", detect: [".clinerules"] },
  { file: "copilot-instructions.md", dir: ".github", label: "Copilot", detect: [".github/copilot-instructions.md"] },
  { file: "GEMINI.md", label: "Gemini CLI", detect: ["GEMINI.md"] },
  { file: "AGENTS.md", label: "Codex CLI", detect: ["AGENTS.md"] },
];

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".nuxt", "coverage",
]);

const SCAN_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

// --- ANSI ---
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

// --- Config (stored as comment in .rtlify-rules.md) ---
async function readConfig(): Promise<RtlifyConfig> {
  try {
    const content = await readFile(resolve(process.cwd(), RULES_FILE), "utf-8");
    const match = content.match(CONFIG_COMMENT_RE);
    if (match) return { enforceI18n: match[1] === "true" };
  } catch {}
  return { enforceI18n: false };
}

async function rulesExist(): Promise<boolean> {
  try { await readFile(resolve(process.cwd(), RULES_FILE), "utf-8"); return true; } catch { return false; }
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

// --- Dynamic skill ---
// --- Pointer content per editor ---
function buildPointer(): string {
  return `# RTLify Rules
When creating or modifying UI components, layouts, or RTL text (Hebrew/Arabic/Persian), you MUST read and strictly adhere to the guidelines in \`.rtlify-rules.md\`.
`;
}

function buildClaudePointer(): string {
  return `# RTLify Rules
When creating or modifying UI components, layouts, or RTL text (Hebrew/Arabic/Persian), you MUST read and strictly adhere to the guidelines in \`.rtlify-rules.md\`.

## /rtlify Command
When the user types \`/rtlify\`:
1. Run \`npx rtlify-ai check\` to find RTL violations
2. Fix every violation according to \`.rtlify-rules.md\` — CSS to logical, icons flipped, \`<bdi>\` tags added
3. Re-run \`npx rtlify-ai check\` to confirm zero violations
Never extract strings to \`t()\` unless the rules file explicitly says to. Never break the build.
`;
}

// --- Violation patterns ---
interface Pattern {
  regex: RegExp;
  category: string;
  message: string;
  i18nOnly?: boolean;
}

const PATTERNS: Pattern[] = [
  { regex: /margin-left|margin-right|padding-left|padding-right|border-left|border-right/, category: "Physical CSS", message: "Use logical properties (margin-inline-start, padding-inline-end, border-inline-start)" },
  { regex: /\bleft\s*:/, category: "Physical CSS", message: "Use inset-inline-start instead of left" },
  { regex: /\bright\s*:/, category: "Physical CSS", message: "Use inset-inline-end instead of right" },
  { regex: /(?:^|[\s"'`{])(?:ml-|mr-|pl-|pr-|-ml-|-mr-|-pl-|-pr-)[\d[]/, category: "Tailwind Physical", message: "Use logical classes (ms-*, me-*, ps-*, pe-*)" },
  { regex: /(?:^|[\s"'`{])(?:left-|right-|-left-|-right-)[\d[]/, category: "Tailwind Physical", message: "Use logical classes (start-*, end-*)" },
  { regex: /(?:^|[\s"'`{])(?:text-left|text-right)(?=[\s"'`}]|$)/, category: "Tailwind Physical", message: "Use text-start / text-end" },
  { regex: /(?:^|[\s"'`{])(?:float-left|float-right)(?=[\s"'`}]|$)/, category: "Tailwind Physical", message: "Use float-start / float-end" },
  { regex: /(?:^|[\s"'`{])(?:rounded-l-|rounded-r-|rounded-tl-|rounded-tr-|rounded-bl-|rounded-br-)/, category: "Tailwind Physical", message: "Use logical rounding (rounded-s-*, rounded-e-*, rounded-ss-*, rounded-se-*, etc.)" },
  { regex: /(?:^|[\s"'`{])(?:border-l-|border-r-)[\d[]/, category: "Tailwind Physical", message: "Use border-s-* / border-e-*" },
  { regex: /(?:^|[\s"'`{])(?:scroll-ml-|scroll-mr-|scroll-pl-|scroll-pr-)/, category: "Tailwind Physical", message: "Use scroll-ms-* / scroll-me-* / scroll-ps-* / scroll-pe-*" },
  { regex: /[>}]\s{0,20}[^<{]{0,500}[\u0590-\u05FF]{2,}/, category: "Hardcoded Hebrew", message: "Hardcoded Hebrew text — extract to i18n translation function", i18nOnly: true },
  { regex: /[>}]\s{0,20}[^<{]{0,500}[\u0600-\u06FF]{2,}/, category: "Hardcoded Arabic", message: "Hardcoded Arabic text — extract to i18n translation function", i18nOnly: true },
];


// --- init ---
async function init() {
  let config: RtlifyConfig;
  const hasConfig = await rulesExist();

  if (hasConfig) {
    config = await readConfig();
    const mode = config.enforceI18n ? "i18n" : "hardcoded";
    console.log("");
    console.log(`  ${DIM}Config found ${RESET}${DIM}.rtlifyrc.json${RESET} ${DIM}(${mode} mode)${RESET}`);
  } else if (process.stdin.isTTY) {
    console.log("");
    console.log(`  ${BOLD}rtlify-ai${RESET} ${DIM}v0.2.0${RESET}`);
    console.log("");
    console.log(`  ${BOLD}How do you handle translations?${RESET}`);
    console.log("");
    console.log(`    ${BOLD}1${RESET}  ${CYAN}Hardcoded${RESET}  — text written inline, no i18n library`);
    console.log(`    ${BOLD}2${RESET}  ${GREEN}i18n${RESET}       — uses react-i18next, next-intl, vue-i18n, etc.`);
    console.log("");
    const answer = await ask(`  ${BOLD}>${RESET} Mode ${DIM}[1/2, default: 1]${RESET} `);
    config = { enforceI18n: answer === "2" };
  } else {
    config = { enforceI18n: false };
  }

  const rulesTemplate = await readFile(RULES_PATH, "utf-8");
  const rule6 = config.enforceI18n ? RULE_6_I18N : RULE_6_HARDCODED;
  const configComment = `<!-- rtlify:enforceI18n=${config.enforceI18n} -->\n`;
  const rulesContent = configComment + rulesTemplate.replace(I18N_PLACEHOLDER, rule6);

  const cwd = process.cwd();
  async function fileExists(p: string): Promise<boolean> {
    try { await readFile(p, "utf-8"); return true; } catch { return false; }
  }
  async function dirExists(p: string): Promise<boolean> {
    try { const entries = await readdir(p); return entries !== undefined; } catch { return false; }
  }

  // Write the full rules file (single source of truth, includes config)
  const rulesPath = resolve(cwd, RULES_FILE);
  let rulesWritten = false;
  let existingRulesContent = "";
  try { existingRulesContent = await readFile(rulesPath, "utf-8"); } catch {}
  if (existingRulesContent !== rulesContent) {
    await writeFile(rulesPath, rulesContent, "utf-8");
    rulesWritten = true;
  }

  // Detect which editors are in use
  const detected: Target[] = [];
  for (const target of TARGET_FILES) {
    for (const signal of target.detect) {
      const signalPath = resolve(cwd, signal);
      if (await fileExists(signalPath) || await dirExists(signalPath)) {
        detected.push(target);
        break;
      }
    }
  }

  // If no editors detected, ask the user to pick (or default to all in non-TTY)
  let targets: Target[];
  if (detected.length > 0) {
    targets = detected;
  } else if (process.stdin.isTTY) {
    console.log("");
    console.log(`  ${BOLD}Which AI editors do you use?${RESET} ${DIM}(comma-separated numbers, or Enter for all)${RESET}`);
    console.log("");
    for (let i = 0; i < TARGET_FILES.length; i++) {
      console.log(`    ${BOLD}${i + 1}${RESET}  ${TARGET_FILES[i].label}`);
    }
    console.log("");
    const picks = await ask(`  ${BOLD}>${RESET} Editors ${DIM}[1-${TARGET_FILES.length}, default: all]${RESET} `);

    if (picks === "") {
      targets = TARGET_FILES;
    } else {
      const indices = picks.split(",").map((s) => parseInt(s.trim(), 10) - 1);
      targets = indices
        .filter((i) => i >= 0 && i < TARGET_FILES.length)
        .map((i) => TARGET_FILES[i]);
      if (targets.length === 0) targets = TARGET_FILES;
    }
  } else {
    targets = TARGET_FILES;
  }

  // Inject pointer into each editor config (CLAUDE.md gets the slash command version)
  const updated: string[] = [];
  for (const { file, dir, label } of targets) {
    const targetDir = dir ? resolve(cwd, dir) : cwd;
    const targetPath = join(targetDir, file);
    if (dir) await mkdir(targetDir, { recursive: true });

    let existing = "";
    try {
      existing = await readFile(targetPath, "utf-8");
    } catch (e: unknown) {
      if (!(e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT")) throw e;
    }
    if (existing.includes(MARKER)) continue;

    const pointer = file === "CLAUDE.md" ? buildClaudePointer() : buildPointer();
    const separator = existing.length > 0 ? "\n\n" : "";
    await writeFile(targetPath, existing + separator + pointer, "utf-8");
    updated.push(label);
  }

  if (updated.length === 0 && !rulesWritten) {
    console.log("");
    console.log(`  ${GREEN}●${RESET} Already set up — nothing to update.`);
    console.log("");
    return;
  }

  const mode = config.enforceI18n ? "i18n" : "hardcoded";

  console.log("");
  console.log(`  ${GREEN}${BOLD}RTLify initialized${RESET}`);
  console.log("");

  if (rulesWritten) {
    console.log(`  ${GREEN}+${RESET} .rtlify-rules.md ${DIM}(rules + config)${RESET}`);
  }
  if (updated.length > 0) {
    for (const label of updated) {
      console.log(`  ${GREEN}+${RESET} ${label}`);
    }
  }

  console.log("");
  console.log(`  ${DIM}Mode${RESET}  ${mode === "i18n" ? `${GREEN}i18n${RESET}` : `${CYAN}hardcoded${RESET}`}`);
  console.log("");
  console.log(`  ${DIM}Next: ${RESET}${BOLD}npx rtlify-ai check${RESET}${DIM} to scan for violations${RESET}`);
  console.log("");
}

// --- check ---
interface Violation { line: number; content: string; category: string; message: string; }

const MAX_LINE_LENGTH = 2000;

function sanitizeForTerminal(s: string): string {
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}

async function collectFiles(dir: string, root?: string): Promise<string[]> {
  const projectRoot = root ?? dir;
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);

    // Resolve symlinks and verify they stay within the project root
    let real: string;
    try { real = await realpath(fullPath); } catch { continue; }
    if (!real.startsWith(projectRoot + "/") && real !== projectRoot) continue;

    if (entry.isDirectory()) files.push(...(await collectFiles(fullPath, projectRoot)));
    else if (SCAN_EXTENSIONS.has(extname(entry.name))) files.push(fullPath);
  }
  return files;
}

function scanContent(content: string, patterns: Pattern[]): Violation[] {
  const violations: Violation[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > MAX_LINE_LENGTH) continue;
    if (/^\s*(\/\/|\/\*|\*|export\s|import\s|require\()/.test(line)) continue;
    const cleaned = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
    for (const pattern of patterns) {
      if (pattern.regex.test(cleaned)) {
        violations.push({ line: i + 1, content: line.trim(), category: pattern.category, message: pattern.message });
        break;
      }
    }
  }
  return violations;
}

async function check() {
  const cwd = process.cwd();
  const config = await readConfig();
  const activePatterns = config.enforceI18n ? PATTERNS : PATTERNS.filter((p) => !p.i18nOnly);
  const mode = config.enforceI18n ? "i18n" : "hardcoded";

  console.log("");
  console.log(`  ${BOLD}rtlify-ai check${RESET} ${DIM}(${mode} mode)${RESET}`);
  console.log("");

  const files = await collectFiles(cwd);
  if (files.length === 0) {
    console.log(`  ${DIM}No .js/.jsx/.ts/.tsx files found.${RESET}`);
    console.log("");
    return;
  }

  let totalViolations = 0;
  let filesWithViolations = 0;

  for (const filePath of files) {
    const content = await readFile(filePath, "utf-8");
    const violations = scanContent(content, activePatterns);
    if (violations.length === 0) continue;
    filesWithViolations++;
    totalViolations += violations.length;
    const relative = filePath.replace(cwd + "/", "");
    console.log(`  ${CYAN}${relative}${RESET}`);
    for (const v of violations) {
      console.log(`    ${DIM}${String(v.line).padStart(4)}${RESET} ${YELLOW}${v.category}${RESET}`);
      console.log(`         ${DIM}${v.message}${RESET}`);
      console.log(`         ${RED}${sanitizeForTerminal(v.content)}${RESET}`);
    }
    console.log();
  }

  if (totalViolations === 0) {
    console.log(`  ${GREEN}${BOLD}No violations found${RESET} ${DIM}— RTL-ready!${RESET}`);
    console.log("");
  } else {
    console.log(`  ${RED}${BOLD}${totalViolations} violation${totalViolations === 1 ? "" : "s"}${RESET} ${DIM}across ${filesWithViolations} file${filesWithViolations === 1 ? "" : "s"}${RESET}`);
    console.log("");
    process.exit(1);
  }
}

// --- fix ---
const FIX_PROMPT = `Scan all files in this project for RTL violations by running \`npx rtlify-ai check\`.
Fix every violation according to the rules in \`.rtlify-rules.md\`.
After fixing, re-run \`npx rtlify-ai check\` to confirm zero remaining violations.`;

async function fix() {
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

  // Try to copy to clipboard
  try {
    const { execSync } = await import("node:child_process");
    if (process.platform === "darwin") {
      execSync("pbcopy", { input: FIX_PROMPT });
      console.log(`  ${GREEN}Copied to clipboard!${RESET}`);
    } else if (process.platform === "linux") {
      execSync("xclip -selection clipboard", { input: FIX_PROMPT });
      console.log(`  ${GREEN}Copied to clipboard!${RESET}`);
    }
  } catch {
    // Clipboard not available — that's fine
  }
  console.log("");
}

// --- help ---
function printUsage() {
  console.log("");
  console.log(`  ${BOLD}rtlify-ai${RESET} ${DIM}v0.1.0${RESET}`);
  console.log(`  ${DIM}RTL-aware AI rules for frontend developers${RESET}`);
  console.log("");
  console.log(`  ${BOLD}Commands${RESET}`);
  console.log("");
  console.log(`    ${BOLD}init${RESET}     Set up RTLify in this project`);
  console.log(`             ${DIM}Auto-detects your editors, asks i18n preference${RESET}`);
  console.log(`    ${BOLD}check${RESET}    Scan for RTL violations`);
  console.log(`             ${DIM}Flags physical CSS, Tailwind classes, and bidi issues${RESET}`);
  console.log(`    ${BOLD}fix${RESET}      Generate a fix prompt for any AI editor`);
  console.log(`             ${DIM}Copies to clipboard — paste into Cursor, Windsurf, Cline, etc.${RESET}`);
  console.log(`    ${BOLD}help${RESET}     Show this message`);
  console.log("");
  console.log(`  ${DIM}Docs${RESET}  ${CYAN}https://github.com/idanlevi1/rtlify${RESET}`);
  console.log("");
}

// --- main ---
const command = process.argv[2];
switch (command) {
  case "init": init().catch((e) => { console.error("Error:", e.message); process.exit(1); }); break;
  case "check": check().catch((e) => { console.error("Error:", e.message); process.exit(1); }); break;
  case "fix": fix().catch((e) => { console.error("Error:", e.message); process.exit(1); }); break;
  case "help": case "--help": case "-h": printUsage(); break;
  default: printUsage(); process.exit(command ? 1 : 0);
}
