<div align="center">

<br/>

# RTLify

### The RTL Brain for AI Coding Agents

Teach your AI editor once — it generates production-ready<br/>RTL code from that point on. No plugins. No runtime. One command.

<br/>

[![CI](https://github.com/idanlevi1/rtlify/actions/workflows/ci.yml/badge.svg)](https://github.com/idanlevi1/rtlify/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/rtlify-ai?style=flat-square&color=cb3837)](https://www.npmjs.com/package/rtlify-ai)
[![license](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square)](package.json)
[![editors](https://img.shields.io/badge/editors-7%20supported-blue?style=flat-square)](#supported-ai-platforms)
[![RTL rules](https://img.shields.io/badge/RTL%20rules-8-orange?style=flat-square)](#core-features)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-lightgrey?style=flat-square)](package.json)

<br/>

**Hebrew** · **Arabic** · **Persian (Farsi)** · **Urdu**

<br/>

<img src="assets/pillars.svg" alt="RTLify — The Three Pillars" width="820" />

<br/>

</div>

<br/>

## Before / After

Same prompt — *"Build an order confirmation card in Hebrew"* — same AI editor:

<table>
<tr><th>❌ Without RTLify</th><th>✅ With RTLify</th></tr>
<tr>
<td>

```tsx
<div className="ml-4 pl-6 text-left">
  <ArrowRight className="mr-2" />
  <p>ההזמנה שלך #12345 אושרה</p>
  <p>סה"כ: ₪249.90</p>
</div>
```

Margins on the wrong side, arrow points backwards, `#12345` jumps to the start of the sentence.

</td>
<td>

```tsx
<div className="ms-4 ps-6 text-start">
  <ArrowRight className="me-2 rtl:-scale-x-100" />
  <p>ההזמנה שלך <bdi>#12345</bdi> אושרה</p>
  <p>סה"כ: {new Intl.NumberFormat('he-IL',
    { style: 'currency', currency: 'ILS' }).format(249.9)}</p>
</div>
```

Logical spacing, flipped icon, bidi-safe order number, localized currency.

</td>
</tr>
</table>

One command, then every component your AI writes looks like the right column.

<br/>

## The Core Idea

**RTLify doesn't fix code after generation — it prevents incorrect code from being generated in the first place.** Teach your AI once instead of fixing every component manually.

> **RTLify is not an i18n library.** It's an AI behavior layer — zero runtime dependencies — that ensures your coding agent uses correct RTL patterns and respects your existing localization setup.

<br/>

## Why

Every AI coding agent is trained on LTR codebases. Ask it to build an RTL interface and it will:

**CSS & Layout**
- `margin-left` instead of `margin-inline-start`
- `ml-4` in Tailwind instead of `ms-4`
- `paddingLeft` in React Native instead of `paddingStart`

**Text & Bidi**
- Hardcoded `"ברוכים הבאים"` or `"مرحباً"` without translation functions
- Mixed Hebrew + numbers without `<bdi>` tags — content jumps around
- US locale for dates and currency

**Components**
- Arrows and chevrons pointing the wrong way
- Carousels, charts, and sliders rendering backwards

...and dozens of subtle bugs that slip into production.

<br/>

## Quick Start

```bash
npx rtlify-ai init
```

Run once per project. After that, just code normally — your AI editor reads the rules automatically in the background.

**Claude Code plugin** (no npm step — adds the `/rtlify:rtlify` command, which sets up the rules on first use):

```
/plugin install rtlify --marketplace idanlevi1/rtlify
```

<sub>Older Claude Code: <code>/plugin marketplace add idanlevi1/rtlify</code> then <code>/plugin install rtlify@rtlify</code></sub>

<br/>

## Supported AI Platforms

<table>
<tr>
<td align="center"><strong>Claude Code</strong><br/><sub>CLAUDE.md + /rtlify</sub></td>
<td align="center"><strong>Cursor</strong><br/><sub>.cursor/rules/rtlify.mdc</sub></td>
<td align="center"><strong>Windsurf</strong><br/><sub>.windsurf/rules/rtlify.md</sub></td>
<td align="center"><strong>Cline</strong><br/><sub>.clinerules (file or folder)</sub></td>
<td align="center"><strong>Copilot</strong><br/><sub>copilot-instructions.md</sub></td>
<td align="center"><strong>Gemini CLI</strong><br/><sub>GEMINI.md</sub></td>
<td align="center"><strong>Codex CLI</strong><br/><sub>AGENTS.md</sub></td>
</tr>
</table>

Editors are auto-detected. Legacy `.cursorrules` / `.windsurfrules` files are reused if your project already has them.

### Supported Frameworks

**React & Next.js** · **Vite** · **React Native** · **Vue** · **Svelte** · **Astro** · **Vanilla JS/TS/CSS/SCSS** · **Tailwind CSS v3 & v4**

<br/>

## How It Works

<div align="center">
<img src="assets/demo.svg" alt="RTLify CLI demo" width="820" />
</div>

<br/>

There is no black box. RTLify saves the full ruleset to `.rtlify-rules.md` and adds a short 3-line pointer to your editor config files. Your config stays clean — the AI knows where to find the rules. Open `.rtlify-rules.md` and read exactly what the AI sees.

### Step 1 — 🧠 The Injection

```bash
npx rtlify-ai init
```

Installs the **RTL Brain**: 8 architecture rules with **"do this / not that"** code examples and a full Tailwind class mapping table. The AI reads them automatically — no extra prompting.

| Option | What it does |
|---|---|
| `--i18n` / `--hardcoded` | Pick the translation mode without the prompt (also switches an existing project) |
| `--editors claude,cursor` | Choose editors explicitly: `claude`, `cursor`, `windsurf`, `cline`, `copilot`, `gemini`, `codex`, `all` |
| `--no-skill` | Don't install the global `/rtlify` Claude Code skill |

### Step 2 — 🔍 The Audit

```bash
npx rtlify-ai check
```

```
  src/components/Sidebar.tsx
       3 Tailwind Physical
         Use logical classes (ms-*, me-*, ps-*, pe-*)
         <div className="ml-4 pl-6 text-left">

  1 violation across 1 file
```

Scans `.js` `.jsx` `.ts` `.tsx` `.mjs` `.cjs` `.css` `.scss` `.sass` `.less` `.vue` `.svelte` `.astro` `.html` — physical CSS (`margin-left`, `left:`, `text-align: right`), inline and React Native styles (`marginLeft`, `paddingRight`), and physical Tailwind classes (`ml-4`, `md:pl-2`, `text-left`, `rounded-tl`, `border-l`…).

```bash
npx rtlify-ai check src/ app/     # only these paths
npx rtlify-ai check --json        # machine-readable report
```

| Exit code | Meaning |
|---|---|
| `0` | No violations |
| `1` | Violations found |
| `2` | No scannable files (wrong folder?) |

Plug it into CI:

```yaml
- run: npx rtlify-ai check
```

**Intentional physical layout?** (a chart axis, a phone-number input) Silence it:

```tsx
<div className="ml-4" /> {/* rtlify-ignore */}
// rtlify-ignore-next-line
const axis = { left: 0 };
/* rtlify-ignore-file */   // in the first 5 lines
```

### Step 3 — 🪄 The `/rtlify` Command

Type **`/rtlify`** in Claude Code. It will:

1. Run `npx rtlify-ai check` to find violations
2. Apply targeted fixes — CSS to logical, icons flipped, `<bdi>` tags added
3. Re-run the check to confirm zero violations

> **Safe by default:** scoped to RTL layout fixes only. Never extracts strings to `t()`. Never invents translation keys. Never introduces undefined imports. Every fix is reviewable in a standard diff.

### Not using Claude Code? — 🔧 `fix`

```bash
npx rtlify-ai fix
```

Generates a ready-to-paste prompt and copies it to your clipboard. Paste it into **Cursor**, **Windsurf**, **Cline**, **Copilot**, or any AI editor — it tells the AI to scan, fix, and verify using the rules in `.rtlify-rules.md`.

<br/>

## Core Features

What the RTL Brain teaches your AI agent:

| | Feature | What the AI Learns | Example |
|---|---|---|---|
| 1 | **Logical CSS** | Replace physical properties with logical | `margin-left` → `margin-inline-start` |
| 2 | **Tailwind Mapping** | 20+ class conversions | `ml-4` → `ms-4`, `text-left` → `text-start` |
| 3 | **Icon Flipping** | Flip directional icons only | `rtl:-scale-x-100` on arrows/chevrons |
| 4 | **BDI Safety** | Wrap LTR in RTL with `<bdi>` | `<bdi>#12345</bdi>` stays anchored |
| 5 | **Localized Formats** | `Intl` APIs with correct locales | `Intl.NumberFormat('he-IL')` → `42.90 ₪` |
| 6 | **Safe i18n** | `t()` only if project has i18n | Never auto-extracts, never breaks builds |
| 7 | **Complex Components** | RTL-aware carousels, charts, sliders | `<Swiper dir="rtl">` |
| 8 | **React Native** | Mobile RTL APIs | `paddingStart`, `I18nManager.isRTL` |

<br/>

## Try It

After `npx rtlify-ai init`, try these prompts:

> 💬 **"Build a checkout form in Hebrew"**
>
> AI uses `ms-4` instead of `ml-4`, formats prices with `Intl.NumberFormat('he-IL')`, wraps text in `t('checkout.total')`.

> 💬 **"Create a React Native settings screen in Arabic"**
>
> AI uses `paddingStart` instead of `paddingLeft`, checks `I18nManager.isRTL` for icon transforms, sets `writingDirection: 'rtl'`.

> 💬 **"Show: 'ההזמנה שלך #12345 אושרה'"**
>
> Order number renders as `<bdi>#12345</bdi>` — stays anchored correctly.

<br/>

## 🎮 Playground

```bash
git clone https://github.com/idanlevi1/rtlify.git
cd rtlify/examples/playground
npx rtlify-ai check
```

`BrokenDashboard.tsx` is packed with RTL mistakes. The linter flags the 8 lines with physical CSS and Tailwind; the bidi and icon issues are what the AI rules teach your editor to fix.

<br/>

## Contributing

We welcome contributions! Here's how to get started:

```bash
# 1. Clone & build
git clone https://github.com/idanlevi1/rtlify.git
cd rtlify
npm install
npm run build

# 2. Project structure
src/
├── cli.ts              # CLI entry — commands, templates, output
├── scanner.ts          # Lint patterns, file walking, ignore comments
├── targets.ts          # Editor detection and config file locations
└── rules.md            # 8 RTL rules (Rule 6 is a dynamic placeholder)
test/                   # node:test suites (no extra dependencies)

examples/playground/
└── BrokenDashboard.tsx # Test file with intentional violations

# 3. Test your changes
npm test                       # Build + run all tests
node dist/cli.js init          # Test init in a temp folder
node dist/cli.js check         # Run linter against playground
node dist/cli.js help          # Verify help output

# 4. Key files to know
# ARCHITECTURE.md              How everything connects (start here!)
# .rtlify-rules.md             Generated rules + config (single source of truth)

# 5. Submit a PR
git checkout -b feat/your-feature
git commit -m "feat: description"
git push -u origin feat/your-feature
gh pr create
```

Read [ARCHITECTURE.md](ARCHITECTURE.md) before diving in — it covers the data flow, key design decisions, and gotchas that will save you time.

<br/>

---

<div align="center">

RTLify is a step toward making AI-generated UI fully localization-aware — not just RTL-correct.

<br/>

Built by **[Idan Levi](https://github.com/idanlevi1)** · If RTLify helped you, give it a ⭐

<br/>

**[MIT License](LICENSE)**

</div>
