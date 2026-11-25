import { readdir, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

export interface Pattern {
  regex: RegExp;
  category: string;
  message: string;
  i18nOnly?: boolean;
}

export interface Violation {
  line: number;
  content: string;
  category: string;
  message: string;
}

// Tailwind class boundaries: a class starts after whitespace, a quote, `{`,
// a variant colon (`md:ml-4`) or the important modifier (`!ml-4`).
const TW_START = String.raw`(?:^|[\s"'\`{:!])`;
const TW_END = String.raw`(?=[\s"'\`}]|$)`;
const tw = (body: string) => new RegExp(TW_START + body);

export const PATTERNS: Pattern[] = [
  // --- CSS (kebab-case) ---
  { regex: /\b(?:margin|padding|border|scroll-margin|scroll-padding)-(?:left|right)\b/, category: "Physical CSS", message: "Use logical properties (margin-inline-start, padding-inline-end, border-inline-start)" },
  { regex: /\bborder-(?:top|bottom)-(?:left|right)-radius\b/, category: "Physical CSS", message: "Use border-start-start-radius / border-start-end-radius / border-end-start-radius / border-end-end-radius" },

  // --- Inline styles / React Native (camelCase) ---
  { regex: /\b(?:margin|padding|border|scrollMargin|scrollPadding)(?:Left|Right)(?![a-z])/, category: "Physical Style", message: "Use marginStart / paddingEnd (React Native) or marginInlineStart / paddingInlineEnd (web)" },
  { regex: /\bborder(?:Top|Bottom)(?:Left|Right)Radius\b/, category: "Physical Style", message: "Use borderTopStartRadius / borderTopEndRadius (React Native) or borderStartStartRadius (web)" },

  // --- Alignment & float (both syntaxes) ---
  { regex: /\btext-?align\s*:\s*["'`]?(?:left|right)\b/i, category: "Physical CSS", message: "Use text-align: start / end" },
  { regex: /\bfloat\s*:\s*["'`]?(?:left|right)\b/, category: "Physical CSS", message: "Use float: inline-start / inline-end" },

  // --- Positioning (`left:` / `right:`), but not ternaries (`a ? left : b`) or custom properties ---
  { regex: /(?<!\?\s*)(?<![\w$.-])left\s*:/, category: "Physical CSS", message: "Use inset-inline-start (CSS) or start (React Native) instead of left" },
  { regex: /(?<!\?\s*)(?<![\w$.-])right\s*:/, category: "Physical CSS", message: "Use inset-inline-end (CSS) or end (React Native) instead of right" },

  // --- Tailwind ---
  { regex: tw(String.raw`-?(?:ml|mr|pl|pr)-(?:\d|\[|auto|px)`), category: "Tailwind Physical", message: "Use logical classes (ms-*, me-*, ps-*, pe-*)" },
  { regex: tw(String.raw`-?(?:left|right)-(?:\d|\[|auto|px|full)`), category: "Tailwind Physical", message: "Use logical classes (start-*, end-*)" },
  { regex: tw(String.raw`(?:text|float|clear)-(?:left|right)` + TW_END), category: "Tailwind Physical", message: "Use *-start / *-end (text-start, float-start, clear-start)" },
  { regex: tw(String.raw`rounded-(?:[lr]|[tb][lr])(?:-|` + TW_END + ")"), category: "Tailwind Physical", message: "Use logical rounding (rounded-s-*, rounded-e-*, rounded-ss-*, rounded-se-*, etc.)" },
  { regex: tw(String.raw`border-[lr](?:-|` + TW_END + ")"), category: "Tailwind Physical", message: "Use border-s-* / border-e-*" },
  { regex: tw(String.raw`-?scroll-[mp][lr]-`), category: "Tailwind Physical", message: "Use scroll-ms-* / scroll-me-* / scroll-ps-* / scroll-pe-*" },

  // --- Hardcoded RTL text (i18n mode only) ---
  { regex: /[>}]\s{0,20}[^<{]{0,500}[֐-׿]{2,}/, category: "Hardcoded Hebrew", message: "Hardcoded Hebrew text — extract to i18n translation function", i18nOnly: true },
  { regex: /[>}]\s{0,20}[^<{]{0,500}[؀-ۿ]{2,}/, category: "Hardcoded Arabic", message: "Hardcoded Arabic/Persian text — extract to i18n translation function", i18nOnly: true },
];

export const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", "coverage",
  ".next", ".nuxt", ".output", ".svelte-kit", ".turbo", ".vercel", ".expo", ".cache",
  "Pods", "vendor",
]);

export const SCAN_EXTENSIONS = new Set([
  ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts",
  ".css", ".scss", ".sass", ".less",
  ".vue", ".svelte", ".astro", ".html",
]);

const MAX_LINE_LENGTH = 2000;
const IGNORE_FILE = "rtlify-ignore-file";
const IGNORE_NEXT_LINE = "rtlify-ignore-next-line";
const IGNORE_LINE = /rtlify-ignore(?![-\w])/;

export function isScannable(name: string): boolean {
  if (name.endsWith(".d.ts") || /\.min\.(js|css)$/.test(name)) return false;
  return SCAN_EXTENSIONS.has(extname(name).toLowerCase());
}

/** True when `child` is `root` itself or lives inside it. Works with both `/` and `\` separators. */
export function isInside(root: string, child: string): boolean {
  const rel = relative(root, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function isCommentLine(line: string): boolean {
  if (/^\s*(\/\/|\/\*|<!--)/.test(line)) return true;
  // JSDoc / block comment continuation — but not a CSS universal selector like `* { ... }`
  return /^\s*\*(?:\s|\/|$)/.test(line) && !line.includes("{");
}

export function scanContent(content: string, patterns: Pattern[]): Violation[] {
  const violations: Violation[] = [];
  const lines = content.split(/\r?\n/);
  if (lines.slice(0, 5).some((l) => l.includes(IGNORE_FILE))) return violations;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > MAX_LINE_LENGTH) continue;
    if (IGNORE_LINE.test(line)) continue;
    if (i > 0 && lines[i - 1].includes(IGNORE_NEXT_LINE)) continue;
    if (isCommentLine(line)) continue;
    if (/^\s*(import\s|@import\s|@use\s)/.test(line) || /\brequire\(/.test(line)) continue;

    // Strip trailing `//` comments (but keep URLs like https://) and inline block comments.
    const cleaned = line
      .replace(/\/\*.*?\*\//g, "")
      .replace(/<!--.*?-->/g, "")
      .replace(/(?<![:\w"'`/])\/\/.*$/, "");

    for (const pattern of patterns) {
      if (pattern.regex.test(cleaned)) {
        violations.push({ line: i + 1, content: line.trim(), category: pattern.category, message: pattern.message });
        break;
      }
    }
  }
  return violations;
}

async function walk(dir: string, root: string, out: string[]): Promise<void> {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);

    // Resolve symlinks and verify they stay within the project root
    let real: string;
    try { real = await realpath(fullPath); } catch { continue; }
    if (!isInside(root, real)) continue;

    let isDir = entry.isDirectory();
    if (entry.isSymbolicLink()) {
      try { isDir = (await stat(real)).isDirectory(); } catch { continue; }
      if (isDir && real === root) continue; // link back to root — avoid loops
    }

    if (isDir) await walk(fullPath, root, out);
    else if (isScannable(entry.name)) out.push(fullPath);
  }
}

/**
 * Collect scannable files under `targets` (files or directories), relative to `cwd`.
 * Everything must stay inside the real path of `cwd`.
 */
export async function collectFiles(cwd: string, targets: string[] = ["."]): Promise<string[]> {
  const root = await realpath(cwd);
  const files = new Set<string>();
  for (const target of targets) {
    const abs = resolve(cwd, target);
    let real: string;
    try { real = await realpath(abs); } catch { throw new Error(`Path not found: ${target}`); }
    if (!isInside(root, real)) throw new Error(`Path is outside the project: ${target}`);
    const s = await stat(real);
    if (s.isDirectory()) {
      const found: string[] = [];
      await walk(abs, root, found);
      found.forEach((f) => files.add(f));
    } else if (isScannable(abs)) {
      files.add(abs);
    }
  }
  return [...files].sort();
}
