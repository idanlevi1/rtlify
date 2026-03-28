#!/usr/bin/env node

import { readFile, writeFile, readdir, mkdir, realpath } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = join(__dirname, "rules.md");
const RULES_FILE = ".rtlify-rules.md";
const MARKER = "# RTLify Rules";
const POINTER = `# RTLify Rules
When creating or modifying UI components, layouts, or RTL text (Hebrew/Arabic/Persian), you MUST read and strictly adhere to the guidelines in \`.rtlify-rules.md\`.
`;
const I18N_PLACEHOLDER = "<!-- RTLIFY_I18N_RULE -->";
const CONFIG_FILE = ".rtlifyrc.json";

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
  { file: "copilot-instructions.md", dir: ".github", label: "Copilot", detect: [".github"] },
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

// --- Config ---
async function readConfig(): Promise<RtlifyConfig> {
  let raw: string;
  try {
    raw = await readFile(resolve(process.cwd(), CONFIG_FILE), "utf-8");
  } catch (e: unknown) {
    if (e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT") {
      return { enforceI18n: false };
    }
    throw e;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error(`${RED}Warning: .rtlifyrc.json is malformed — using defaults.${RESET}`);
    return { enforceI18n: false };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { enforceI18n: false };
  }
  const obj = parsed as Record<string, unknown>;
  return { enforceI18n: obj.enforceI18n === true };
}

async function writeConfig(config: RtlifyConfig): Promise<void> {
  await writeFile(resolve(process.cwd(), CONFIG_FILE), JSON.stringify(config, null, 2) + "\n", "utf-8");
}

async function configExists(): Promise<boolean> {
  try { await readFile(resolve(process.cwd(), CONFIG_FILE), "utf-8"); return true; } catch { return false; }
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
function buildSkillContent(config: RtlifyConfig): string {
  const i18nBlock = config.enforceI18n
    ? `   - Extract hardcoded Hebrew/Arabic strings into \`t('component.key')\` and generate the corresponding translation JSON entries.
   - Ensure all new text uses the project's translation function.`
    : `   - Do NOT extract strings to \`t()\` or create translation keys — this project does not use i18n.
   - Leave Hebrew/Arabic text hardcoded in the JSX as-is.
   - Only wrap embedded LTR content (numbers, English words, dates) in \`<bdi>\` tags.`;

  const safetyNote = config.enforceI18n
    ? `**i18n mode:** This project uses translation functions. When extracting strings, always create the matching JSON entries so the UI renders correctly.`
    : `**Hardcoded mode:** This project does NOT use i18n. NEVER introduce \`t()\` functions, \`useTranslation()\` imports, or translation keys. This will break the build.`;

  return `---
name: rtlify
description: Scan the current file or project for RTL layout violations and automatically refactor them. Safe by default — never breaks builds.
---

# RTLify Skill

When the user invokes \`/rtlify\`, you must:

1. **Scan for violations:** Run \`npx rtlify check\` in the project root to identify all RTL violations.

2. **Analyze the output:** Parse the violation report. Group the issues by file and category.

3. **Auto-refactor each violation:**
   - Convert physical CSS properties to logical equivalents (\`margin-left\` -> \`margin-inline-start\`, \`left\` -> \`inset-inline-start\`).
   - Convert physical Tailwind classes to logical ones (\`ml-4\` -> \`ms-4\`, \`text-left\` -> \`text-start\`, \`rounded-tl-*\` -> \`rounded-ss-*\`). Refer to the full mapping table in \`.rtlify-rules.md\`.
   - Add \`rtl:-scale-x-100\` to any directional icons (arrows, chevrons) that lack it.
${i18nBlock}

4. **Report a summary:** After refactoring, list every file changed and what was fixed. Then re-run \`npx rtlify check\` to confirm zero remaining violations.

${safetyNote}
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

// --- Claude Code slash command ---
const SKILL_DIR = ".claude/skills/rtlify";
const SKILL_FILE = "SKILL.md";
const SKILL_MARKER = "# RTLify Skill";

async function initSkill(config: RtlifyConfig): Promise<boolean> {
  const skillDir = resolve(process.cwd(), SKILL_DIR);
  const skillPath = join(skillDir, SKILL_FILE);
  await mkdir(skillDir, { recursive: true });

  let existing = "";
  try { existing = await readFile(skillPath, "utf-8"); } catch {}

  const content = buildSkillContent(config);

  if (existing.includes(SKILL_MARKER)) {
    const hadI18n = existing.includes("translation functions");
    if ((hadI18n && config.enforceI18n) || (!hadI18n && !config.enforceI18n)) return false;
  }

  await writeFile(skillPath, content, "utf-8");
  return true;
}

// --- init ---
async function init() {
  let config: RtlifyConfig;
  const hasConfig = await configExists();

  if (hasConfig) {
    config = await readConfig();
    const mode = config.enforceI18n ? "i18n" : "hardcoded";
    console.log("");
    console.log(`  ${DIM}Config found ${RESET}${DIM}.rtlifyrc.json${RESET} ${DIM}(${mode} mode)${RESET}`);
  } else if (process.stdin.isTTY) {
    console.log("");
    console.log(`  ${BOLD}rtlify${RESET} ${DIM}v0.1.0${RESET}`);
    console.log("");
    console.log(`  ${BOLD}Does this project use i18n?${RESET} ${DIM}(react-i18next, next-intl, vue-i18n)${RESET}`);
    console.log("");
    console.log(`    ${GREEN}y${RESET}  AI wraps text in t('key'), linter flags hardcoded strings`);
    console.log(`    ${CYAN}n${RESET}  AI writes text inline, linter only checks CSS & layout`);
    console.log("");
    const answer = await ask(`  ${BOLD}>${RESET} i18n? ${DIM}[y/N]${RESET} `);
    config = { enforceI18n: answer === "y" || answer === "yes" };
    await writeConfig(config);
  } else {
    config = { enforceI18n: false };
    await writeConfig(config);
  }

  const rulesTemplate = await readFile(RULES_PATH, "utf-8");
  const rule6 = config.enforceI18n ? RULE_6_I18N : RULE_6_HARDCODED;
  const rulesContent = rulesTemplate.replace(I18N_PLACEHOLDER, rule6);

  const cwd = process.cwd();
  async function fileExists(p: string): Promise<boolean> {
    try { await readFile(p, "utf-8"); return true; } catch { return false; }
  }
  async function dirExists(p: string): Promise<boolean> {
    try { const entries = await readdir(p); return entries !== undefined; } catch { return false; }
  }

  // Always create/update the full rules file (single source of truth)
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

  // If no editors detected, write to all (first-time setup)
  const targets = detected.length > 0 ? detected : TARGET_FILES;

  // Inject short pointer into each editor config
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

    const separator = existing.length > 0 ? "\n\n" : "";
    await writeFile(targetPath, existing + separator + POINTER, "utf-8");
    updated.push(label);
  }

  const skillCreated = await initSkill(config);

  if (updated.length === 0 && !skillCreated && !rulesWritten) {
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
    console.log(`  ${GREEN}+${RESET} .rtlify-rules.md ${DIM}(full ruleset)${RESET}`);
  }
  if (updated.length > 0) {
    for (const label of updated) {
      console.log(`  ${GREEN}+${RESET} ${label} ${DIM}(pointer added)${RESET}`);
    }
  } else if (rulesWritten) {
    console.log(`  ${GREEN}+${RESET} All 7 platforms ${DIM}(no editors detected, pointers added)${RESET}`);
  }
  if (skillCreated) {
    console.log(`  ${GREEN}+${RESET} /rtlify slash command`);
  }

  console.log("");
  console.log(`  ${DIM}Mode${RESET}    ${mode === "i18n" ? `${CYAN}i18n${RESET} — AI uses t('key')` : `${CYAN}hardcoded${RESET} — AI writes text inline`}`);
  console.log(`  ${DIM}Config${RESET}  .rtlifyrc.json`);
  console.log("");
  console.log(`  ${DIM}Next: ${RESET}${BOLD}npx rtlify check${RESET}${DIM} to scan for violations${RESET}`);
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
  console.log(`  ${BOLD}rtlify check${RESET} ${DIM}(${mode} mode)${RESET}`);
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

// --- help ---
function printUsage() {
  console.log("");
  console.log(`  ${BOLD}rtlify${RESET} ${DIM}v0.1.0${RESET}`);
  console.log(`  ${DIM}RTL-aware AI rules for frontend developers${RESET}`);
  console.log("");
  console.log(`  ${BOLD}Commands${RESET}`);
  console.log("");
  console.log(`    ${BOLD}init${RESET}     Set up RTLify in this project`);
  console.log(`             ${DIM}Auto-detects your editors, asks i18n preference${RESET}`);
  console.log(`    ${BOLD}check${RESET}    Scan for RTL violations`);
  console.log(`             ${DIM}Flags physical CSS, Tailwind classes, and bidi issues${RESET}`);
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
  case "help": case "--help": case "-h": printUsage(); break;
  default: printUsage(); process.exit(command ? 1 : 0);
}
