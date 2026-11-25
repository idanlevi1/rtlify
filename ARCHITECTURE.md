# Architecture

RTLify is a zero-config CLI tool that teaches AI coding agents to generate correct RTL code. It has zero runtime dependencies.

## How It Works

RTLify injects a structured markdown document — containing 8 RTL architecture rules with concrete code examples — into editor config files that AI agents read before generating code. There is no runtime, no server, no plugin API. The AI reads the rules and follows them.

```
npx rtlify-ai init
  │
  ├─ Reads src/rules.md (template with placeholder)
  ├─ Replaces <!-- RTLIFY_I18N_RULE --> with the correct Rule 6 variant
  │
  ├─ Writes .rtlify-rules.md (full rules + config as HTML comment)
  │   Config stored as: <!-- rtlify:enforceI18n=false -->
  │
  ├─ Auto-detects which editors are in use (if none found, shows interactive picker)
  │   (or uses --editors claude,cursor,... ; --i18n / --hardcoded force the mode)
  ├─ Writes a short pointer for each editor (src/targets.ts):
  │   ├── CLAUDE.md                          (Claude Code)
  │   ├── .cursor/rules/rtlify.mdc           (Cursor — or appends to legacy .cursorrules)
  │   ├── .windsurf/rules/rtlify.md          (Windsurf — or appends to legacy .windsurfrules)
  │   ├── .clinerules or .clinerules/rtlify.md (Cline — file or folder)
  │   ├── .github/copilot-instructions.md    (Copilot)
  │   ├── GEMINI.md                          (Gemini CLI)
  │   └── AGENTS.md                          (Codex CLI)
  │
  └─ If Claude Code selected: installs /rtlify skill globally (~/.claude/skills/rtlify/SKILL.md)
      — only if missing or still managed by rtlify-ai (never overwrites user edits)

npx rtlify-ai check
  │
  ├─ Reads config from .rtlify-rules.md header comment
  ├─ Recursively scans JS/TS, CSS/SCSS/Less, Vue, Svelte, Astro, HTML (skips node_modules, dist, etc.)
  │   or only the paths given as arguments
  ├─ Runs the regex patterns in src/scanner.ts against each line
  └─ Prints violations (or JSON with --json); exit 0 clean, 1 violations, 2 no files
```

## File Structure

```
rtlify/
├── src/
│   ├── cli.ts            # CLI entry point — commands, templates, output
│   ├── scanner.ts        # Lint patterns, file walker, ignore comments
│   ├── targets.ts        # Editor detection + where each pointer is written
│   └── rules.md          # 8 RTL rules with <!-- RTLIFY_I18N_RULE --> placeholder
├── test/                 # node:test suites (scanner + CLI end-to-end)
├── .github/workflows/    # CI: Linux / macOS / Windows × Node 18, 20, 22
├── dist/                  # Compiled JS + rules.md copy
├── examples/
│   └── playground/
│       └── BrokenDashboard.tsx   # Intentional RTL mistakes for testing
├── assets/
│   └── pillars.svg        # README infographic
├── package.json           # bin: "rtlify-ai", zero runtime deps
└── tsconfig.json
```

## Key Design Decisions

### 1. Rule 6 Is Dynamic (Template Replacement)

`rules.md` contains a `<!-- RTLIFY_I18N_RULE -->` placeholder — not actual i18n instructions. During `init`, the CLI replaces it with one of two variants:

- **i18n mode**: "All text MUST use `t('key')`"
- **Hardcoded mode**: "NEVER use `t()`, write text inline"

The AI sees deterministic instructions, not conditional logic. The two rule variants are string constants in `cli.ts` (`RULE_6_I18N` and `RULE_6_HARDCODED`).

### 2. Config Drives Everything

Config is stored as an HTML comment at the top of `.rtlify-rules.md` (`<!-- rtlify:enforceI18n=false -->`). No separate config file. It controls:

- Which Rule 6 variant is in the rules file
- Which regex patterns `check` runs (hardcoded text patterns have `i18nOnly: true`)

### 3. Safe by Default

The `/rtlify` slash command never auto-extracts strings to `t()` in hardcoded mode. This prevents the most common destructive refactoring mistake: inserting `t('key')` calls without creating the matching translation JSON, which shows raw keys in the UI.

### 4. Prevention Over Correction

RTLify doesn't fix broken code after generation — it prevents incorrect code from being generated in the first place. The linter (`check`) is a secondary verification tool, not the primary value.

## The 8 RTL Rules

| # | Rule | What It Enforces |
|---|---|---|
| 1 | Logical CSS | `margin-inline-start` instead of `margin-left` |
| 2 | Tailwind Mapping | `ms-4` instead of `ml-4` (20+ class conversions) |
| 3 | Icon Flipping | `rtl:-scale-x-100` on directional icons |
| 4 | BDI Safety | `<bdi>` tags for LTR content inside RTL text |
| 5 | Localized Formats | `Intl.NumberFormat` / `Intl.DateTimeFormat` with correct locales |
| 6 | i18n Mode | Dynamic — depends on config in `.rtlify-rules.md` header |
| 7 | Complex Components | Carousels, charts, sliders with RTL-aware config |
| 8 | React Native | `I18nManager.isRTL`, `paddingStart`, `writingDirection` |

## Linter Patterns

The `check` command's patterns live in `PATTERNS` (`src/scanner.ts`):

- Physical CSS, kebab-case (`margin-left`, `border-top-left-radius`, `text-align: left`, `float: right`, `left:`/`right:`)
- Physical styles, camelCase for inline styles and React Native (`marginLeft`, `paddingRight`, `borderTopLeftRadius`, `textAlign: 'left'`)
- Physical Tailwind (`ml-*`, `ml-auto`, `left-*`, `text-left`, `float-right`, `clear-left`, `rounded-l`, `rounded-tl-*`, `border-l`, `scroll-ml-*`) including variants (`md:`) and `!important`
- 2 hardcoded text patterns (Hebrew `[\u0590-\u05FF]`, Arabic `[\u0600-\u06FF]`) — only active when `enforceI18n: true`

Lines over 2000 characters are skipped (ReDoS prevention). Comment lines and `import`/`require`/`@import` lines are skipped. Inline comments are stripped before matching (URLs like `https://` are kept). `rtlify-ignore`, `rtlify-ignore-next-line` and `rtlify-ignore-file` comments silence findings. Symlinks are resolved and verified to stay within the project root using `path.relative` (works with Windows `\` paths). Every pattern has a test in `test/scanner.test.mjs` — add one when you add a pattern.

## Gotchas for Contributors

**Hebrew detection is single-line.** The regex `/[>}]\s{0,20}[^<{]{0,500}[\u0590-\u05FF]{2,}/` requires a `>` or `}` on the same line as the Hebrew text. Multi-line JSX where the opening tag and text are on separate lines won't match.

**Interactive prompt only works in TTY.** `process.stdin.isTTY` gates the i18n/hardcoded question. In CI or piped input, it silently defaults to `enforceI18n: false`.

**`/rtlify` is a global skill.** The slash command lives at `~/.claude/skills/rtlify/SKILL.md` (user's home, not the project). It's installed automatically when Claude Code is detected during `init`. This keeps the project clean — only `CLAUDE.md` and `.rtlify-rules.md` appear in the project.
