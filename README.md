<div align="center">

# RTLify

**RTL-aware AI rules for frontend developers.**<br/>
**Hebrew · Arabic · Persian (Farsi) · Urdu**

[![npm version](https://img.shields.io/npm/v/rtlify)](https://www.npmjs.com/package/rtlify)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

```bash
npx rtlify init
```

<img src="assets/pillars.svg" alt="RTLify — The Three Pillars" width="820" />

</div>

---

## The Core Idea

AI coding agents are trained on LTR codebases. They don't know RTL. Every component they generate has broken margins, flipped icons, corrupted bidi text, and hardcoded strings.

**RTLify doesn't fix code after generation — it prevents incorrect code from being generated in the first place.**

One command injects RTL architecture rules directly into your AI editor's context. From that point on, the AI consistently generates production-ready RTL-aware code. Teach it once instead of fixing every component manually.

> **RTLify is not an i18n library.** It has zero runtime dependencies — it's an AI behavior layer that ensures your coding agent uses correct RTL patterns and respects your existing localization setup.

**Who it's for:** Frontend and mobile developers building products for RTL markets — whether you're a solo developer or a team shipping to millions of Hebrew, Arabic, or Persian-speaking users.

---

## The Problem

**CSS & Layout**
- ❌ `margin-left` instead of `margin-inline-start` — layout mirrors incorrectly
- ❌ `ml-4` in Tailwind instead of `ms-4` — spacing breaks in RTL
- ❌ `paddingLeft` in React Native instead of `paddingStart`

**Text & Bidi**
- ❌ Hardcoded `"ברוכים הבאים"` or `"مرحباً"` in JSX without translation functions
- ❌ Mixed Hebrew + numbers without `<bdi>` tags — content jumps to wrong positions
- ❌ Dates and currency formatted for US locale

**Components**
- ❌ Arrows and chevrons pointing the wrong direction
- ❌ Carousels, charts, and sliders rendering backwards

...and dozens of subtle RTL bugs that slip into production.

---

## Installation & Setup

| Requirement | Version |
|---|---|
| **Node.js** | 18+ |

```bash
npx rtlify init
```

> **Interactive Setup:** During initialization, RTLify will ask if you want to enforce strict i18n or allow hardcoded RTL strings. It adapts safely to both workflows.

RTLify injects rules into all supported platforms and installs a `/rtlify` slash command for Claude Code. Zero config.

### Supported AI Platforms

**Claude Code** · **Cursor** · **Windsurf** · **Cline** · **GitHub Copilot** · **Gemini CLI** · **Codex CLI**

### Supported Frameworks

| Stack | Status |
|---|---|
| **React & Next.js** (App Router & Pages Router) | ✅ Full |
| **Vite + React** | ✅ Full |
| **React Native** (Web & Mobile) | ✅ Full |
| **Vanilla JS / TypeScript** | ✅ Full |
| **Tailwind CSS** (v3 & v4) | ✅ Full |

---

## How RTLify Works

There is no black box. RTLify saves the full ruleset to `.rtlify-rules.md` and adds a short 3-line pointer to your editor config files (`CLAUDE.md`, `.cursorrules`, etc.) that tells the AI to read it. Your config files stay clean. You can open `.rtlify-rules.md` and read exactly what the AI sees. Full transparency, no abstractions.

### Step 1 — 🧠 The Injection

> `npx rtlify init` installs the **RTL Brain** into your project.

The rules include **"do this / not that"** code blocks and a full Tailwind class mapping table. The AI reads them automatically on every conversation — no extra prompting needed.

### Step 2 — 🔍 The Audit

> `npx rtlify check` scans your codebase for RTL violations.

```
src/components/Sidebar.tsx
  L14  Tailwind Physical  Use logical classes (ms-*, me-*, ps-*, pe-*)
       <div className="ml-4 pl-6 text-left">

src/pages/Home.tsx
  L22  Hardcoded Hebrew   Check for mixed LTR content (numbers, English) that needs <bdi> wrapping
       <p>הזמנה מספר #12345 התקבלה</p>

Found 2 violation(s) across 2 file(s).
```

Exits with **code 1** — plug it into CI.

### Step 3 — 🪄 The `/rtlify` Slash Command

> Type **`/rtlify`** in Claude Code to apply safe, reviewable RTL fixes.

The slash command instructs Claude to:

1. Run `npx rtlify check` to find violations
2. Apply targeted fixes — physical CSS to logical, icons flipped, inline `<bdi>` tags added
3. Re-run the check to confirm zero remaining violations

**Safety guarantees:**
- Every change is scoped to RTL layout fixes — no architecture rewrites, no unrelated logic changes
- Never extracts strings into `t()` or invents translation keys
- Never introduces undefined imports or functions
- Every fix is visible in a standard diff — review before you commit

The `/rtlify` command is safe to run on any codebase. It will not break your build.

---

## Core Features

What the RTL Brain teaches your AI agent:

| Feature | What the AI Learns to Do | Example / Impact |
|---|---|---|
| **Logical CSS** | Replace physical directional properties with logical equivalents | `margin-left` → `margin-inline-start`, `left` → `inset-inline-start` |
| **Tailwind Mapping** | Use logical utility classes from a 20+ class conversion table | `ml-4` → `ms-4`, `text-left` → `text-start`, `rounded-tl-*` → `rounded-ss-*` |
| **Icon Flipping** | Flip directional icons in RTL mode, skip non-directional icons | `<ChevronRight className="rtl:-scale-x-100" />` |
| **BDI Safety** | Wrap LTR content inside RTL sentences with inline `<bdi>` tags | `<bdi>#12345</bdi>` keeps order numbers anchored correctly |
| **Localized Formats** | Use `Intl` APIs with correct locale codes for dates and currency | `Intl.NumberFormat('he-IL', { currency: 'ILS' })` → `42.90 ₪` |
| **Safe i18n** | Use `t()` only when the project has i18n set up; never auto-extract | Existing `t()` calls respected; no build-breaking refactors |
| **Complex Components** | Configure carousels, charts, and sliders for RTL rendering | `<Swiper dir="rtl">`, `<XAxis reversed={isRTL} />` |
| **React Native** | Use mobile-specific RTL APIs and Flexbox start/end | `paddingStart`, `I18nManager.isRTL`, `writingDirection: 'rtl'` |

---

## Try It

After running `npx rtlify init`, try these prompts in your editor:

> 💬 **"Build a checkout form in Hebrew"**
>
> AI uses `ms-4` instead of `ml-4`, formats prices with `Intl.NumberFormat('he-IL')`, wraps text in `t('checkout.total')`.

> 💬 **"Create a React Native settings screen in Arabic"**
>
> AI uses `paddingStart` instead of `paddingLeft`, checks `I18nManager.isRTL` for icon transforms, sets `writingDirection: 'rtl'` on text.

> 💬 **"Show a confirmation: 'ההזמנה שלך #12345 אושרה'"**
>
> Order number renders as `<bdi>#12345</bdi>` — stays anchored in the correct visual position.

---

## 🎮 Local Playground

Clone the repo and run:

```bash
cd examples/playground
npx rtlify check
```

`BrokenDashboard.tsx` is packed with 11 intentional RTL violations. The linter catches all of them.

---

RTLify is a step toward making AI-generated UI fully localization-aware — not just RTL-correct.

---

## Contributing

### For Users

Just run `npx rtlify init` in your project. RTLify auto-detects which editors you use and only writes to the relevant config files. No manual setup needed.

### For Contributors

```bash
# 1. Clone the repository
git clone https://github.com/idanlevi1/rtlify.git
cd rtlify

# 2. Install dependencies & build
npm install
npm run build

# 3. Understand the structure
src/
├── cli.ts              # CLI entry point — commands, patterns, templates, detection
└── rules.md            # 8 RTL rules (Rule 6 is a dynamic placeholder)

examples/playground/
└── BrokenDashboard.tsx # Test file with intentional violations

# 4. Test your changes locally
node dist/cli.js init          # Test init in a temp folder
node dist/cli.js check         # Test linter against playground
node dist/cli.js help          # Test help output

# 5. Key files to know
# - ARCHITECTURE.md            Explains how everything connects
# - .rtlifyrc.json             Generated config (i18n vs hardcoded mode)
# - src/rules.md               Contains <!-- RTLIFY_I18N_RULE --> placeholder
#                               (replaced at runtime — see ARCHITECTURE.md)

# 6. Create a PR (never push directly to main)
git checkout -b feat/your-feature
git commit -m "feat: description"
git push -u origin feat/your-feature
gh pr create
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed design decisions, the data flow diagram, and gotchas for new contributors.

## License

MIT
