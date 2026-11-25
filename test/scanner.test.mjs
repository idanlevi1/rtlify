import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PATTERNS, scanContent, collectFiles, isInside, isScannable } from "../dist/scanner.js";

const LAYOUT = PATTERNS.filter((p) => !p.i18nOnly);
const flagged = (src, patterns = LAYOUT) => scanContent(src, patterns).length > 0;

test("flags physical CSS (kebab-case)", () => {
  for (const src of [
    ".a { margin-left: 4px; }",
    ".a { padding-right: 4px; }",
    ".a { border-left-width: 1px; }",
    ".a { border-top-left-radius: 4px; }",
    ".a { left: 0; }",
    ".a { text-align: right; }",
    ".a { float: left; }",
    "* { margin-left: 0 }",
  ]) assert.ok(flagged(src), src);
});

test("flags camelCase inline styles / React Native", () => {
  for (const src of [
    "const s = { marginLeft: 8 };",
    "<div style={{ paddingRight: '12px' }} />",
    "const s = { borderLeftWidth: 1 };",
    "const s = { borderTopRightRadius: 4 };",
    "const s = { textAlign: 'left' };",
    "const s = { position: 'absolute', right: 0 };",
  ]) assert.ok(flagged(src), src);
});

test("flags physical Tailwind classes, including variants and keywords", () => {
  for (const src of [
    '<div className="ml-4" />',
    '<div className="ml-auto" />',
    '<div className="pl-px" />',
    '<div className="-mr-2" />',
    '<div className="md:pl-4" />',
    '<div className="!pr-2" />',
    '<div className="left-0" />',
    '<div className="-right-1/2" />',
    '<div className="text-left" />',
    '<div className="float-right" />',
    '<div className="rounded-l-lg" />',
    '<div className="rounded-tl" />',
    '<div className="border-l" />',
    '<div className="border-r-2" />',
    '<div className="scroll-ml-4" />',
    "<div class=\"ml-4\"></div>",
  ]) assert.ok(flagged(src), src);
});

test("scans export lines", () => {
  assert.ok(flagged('export const Btn = () => <div className="ml-4 text-left">x</div>;'));
});

test("does not flag logical equivalents", () => {
  for (const src of [
    '<div className="ms-4 me-auto ps-2 pe-px start-0 end-0 text-start float-end rounded-s-lg border-s-2" />',
    ".a { margin-inline-start: 4px; inset-inline-end: 0; text-align: start; }",
    "const s = { marginStart: 8, paddingEnd: 4, textAlign: 'auto' };",
  ]) assert.equal(flagged(src), false, src);
});

test("avoids common false positives", () => {
  for (const src of [
    "const side = isRtl ? left : right;",
    "const x = cond ? left : 0;",
    ".a { --gutter-left: 4px; }",
    "import { marginLeft } from './styles';",
    "// margin-left: 4px",
    " * margin-left is bad",
    "/* ml-4 */",
    "<!-- ml-4 -->",
    'const leftover = 1; const sleft = { aleft: 1 };',
    'const url = "https://example.com"; // ml-4',
  ]) assert.equal(flagged(src), false, src);
});

test("keeps classes after URLs on the same line", () => {
  assert.ok(flagged('<a href="https://example.com" className="ml-4">x</a>'));
});

test("handles CRLF line endings", () => {
  const v = scanContent("const a = 1;\r\n<div className=\"ml-4\" />\r\n", LAYOUT);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 2);
  assert.ok(!v[0].content.includes("\r"));
});

test("supports ignore comments", () => {
  assert.equal(flagged('<div className="ml-4" /> {/* rtlify-ignore */}'), false);
  assert.equal(flagged('const s = { left: 0 }; // rtlify-ignore'), false);
  assert.equal(flagged('// rtlify-ignore-next-line\n<div className="ml-4" />'), false);
  assert.equal(flagged('/* rtlify-ignore-file */\n<div className="ml-4" />'), false);
  assert.ok(flagged('// rtlify-ignore-next-line\nconst a = 1;\n<div className="ml-4" />'));
});

test("hardcoded Hebrew/Arabic only in i18n mode", () => {
  const src = "<p>שלום עולם</p>\n<p>مرحبا</p>";
  assert.equal(scanContent(src, LAYOUT).length, 0);
  assert.equal(scanContent(src, PATTERNS).length, 2);
});

test("isInside works for nested, equal and outside paths", () => {
  const root = join(tmpdir(), "proj");
  assert.ok(isInside(root, root));
  assert.ok(isInside(root, join(root, "src", "a.ts")));
  assert.equal(isInside(root, join(tmpdir(), "proj-other", "a.ts")), false);
  assert.equal(isInside(root, tmpdir()), false);
});

test("isScannable filters extensions", () => {
  for (const f of ["a.ts", "a.tsx", "a.jsx", "a.mjs", "a.css", "a.scss", "a.vue", "a.svelte", "a.astro", "a.html"]) assert.ok(isScannable(f), f);
  for (const f of ["a.d.ts", "a.min.js", "a.min.css", "a.json", "a.md"]) assert.equal(isScannable(f), false, f);
});

test("collectFiles walks the tree, skips build dirs, accepts path args", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rtlify-"));
  try {
    await mkdir(join(dir, "src", "nested"), { recursive: true });
    await mkdir(join(dir, "node_modules", "x"), { recursive: true });
    await mkdir(join(dir, "dist"), { recursive: true });
    await writeFile(join(dir, "App.tsx"), "");
    await writeFile(join(dir, "src", "nested", "b.css"), "");
    await writeFile(join(dir, "src", "c.json"), "");
    await writeFile(join(dir, "node_modules", "x", "i.js"), "");
    await writeFile(join(dir, "dist", "o.js"), "");

    const all = (await collectFiles(dir)).map((f) => f.slice(dir.length + 1).replace(/\\/g, "/"));
    assert.deepEqual(all, ["App.tsx", "src/nested/b.css"]);

    const sub = (await collectFiles(dir, ["src"])).map((f) => f.slice(dir.length + 1).replace(/\\/g, "/"));
    assert.deepEqual(sub, ["src/nested/b.css"]);

    await assert.rejects(collectFiles(dir, ["missing"]), /Path not found/);
    await assert.rejects(collectFiles(join(dir, "src"), [".."]), /outside the project/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
