# Architecture

RTLify is a zero-config CLI tool that teaches AI coding agents to generate correct RTL code. It has zero runtime dependencies.

## How It Works

RTLify injects a structured markdown document — containing 8 RTL architecture rules with concrete code examples — into editor config files that AI agents read before generating code. There is no runtime, no server, no plugin API. The AI reads the rules and follows them.

```
npx rtlify-ai init
  │
  ├─ Reads src/rules.md (template with placeholder)
  ├─ Reads .rtlifyrc.json (user's i18n preference)
  ├─ Replaces <!-- RTLIFY_I18N_RULE --> with the correct Rule 6 variant
  │
  ├─ Writes full ruleset to .rtlify-rules.md (single source of truth)
  │   (always created/updated — stays in sync with config)
  │
  ├─ Auto-detects which editors are in use (falls back to all 7 if none found)
  ├─ Appends a short pointer (3 lines) to detected editor config files:
  │   ├── CLAUDE.md                        (Claude Code)
  │   ├── .cursorrules                     (Cursor)
  │   ├── .windsurfrules                   (Windsurf)
  │   ├── .clinerules                      (Cline)
  │   ├── .github/copilot-instructions.md  (Copilot)
  │   ├── GEMINI.md                        (Gemini CLI)
  │   └── AGENTS.md                        (Codex CLI)
  │
  │   The pointer reads:
  │     "When creating or modifying UI components... read .rtlify-rules.md"
  │
  └─ Generates .claude/skills/rtlify/SKILL.md (the /rtlify slash command)

npx rtlify-ai check
  │
  ├─ Reads .rtlifyrc.json → determines which patterns to run
  ├─ Recursively scans .js/.jsx/.ts/.tsx files (skips node_modules, dist, etc.)
  ├─ Runs 12 regex patterns against each line
  └─ Outputs violations, exits with code 1 if any found
```

## File Structure

```
rtlify/
├── src/
│   ├── cli.ts            # CLI entry point — all commands, patterns, templates
│   └── rules.md          # 8 RTL rules with <!-- RTLIFY_I18N_RULE --> placeholder
├── dist/                  # Compiled JS + rules.md copy
├── examples/
│   └── playground/
│       └── BrokenDashboard.tsx   # 11 intentional violations for testing
├── assets/
│   └── pillars.svg        # README infographic
├── package.json           # v0.1.0, bin: "rtlify", zero runtime deps
└── tsconfig.json
```

## Key Design Decisions

### 1. Rule 6 Is Dynamic (Template Replacement)

`rules.md` contains a `<!-- RTLIFY_I18N_RULE -->` placeholder — not actual i18n instructions. During `init`, the CLI replaces it with one of two variants:

- **i18n mode**: "All text MUST use `t('key')`"
- **Hardcoded mode**: "NEVER use `t()`, write text inline"

The AI sees deterministic instructions, not conditional logic. The two rule variants are string constants in `cli.ts` (`RULE_6_I18N` and `RULE_6_HARDCODED`).

### 2. Config Drives Everything

`.rtlifyrc.json` (`{ "enforceI18n": boolean }`) is the single source of truth. It controls:

- Which Rule 6 variant is injected into editor config files
- Which regex patterns `check` runs (hardcoded text patterns have `i18nOnly: true`)
- What instructions the `/rtlify` slash command contains

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
| 6 | i18n Mode | Dynamic — depends on `.rtlifyrc.json` config |
| 7 | Complex Components | Carousels, charts, sliders with RTL-aware config |
| 8 | React Native | `I18nManager.isRTL`, `paddingStart`, `writingDirection` |

## Linter Patterns

The `check` command runs 12 regex patterns:

- 3 physical CSS patterns (`margin-left`, `left:`, `right:`)
- 7 physical Tailwind patterns (`ml-*`, `text-left`, `float-right`, `rounded-tl-*`, `border-l-*`, `scroll-ml-*`, positional `left-*`/`right-*`)
- 2 hardcoded text patterns (Hebrew `[\u0590-\u05FF]`, Arabic `[\u0600-\u06FF]`) — only active when `enforceI18n: true`

Lines over 2000 characters are skipped (ReDoS prevention). Comment lines and `import`/`export` statements are skipped. Inline comments are stripped before matching. Symlinks are resolved and verified to stay within the project root.

## Gotchas for Contributors

**Hebrew detection is single-line.** The regex `/[>}]\s{0,20}[^<{]{0,500}[\u0590-\u05FF]{2,}/` requires a `>` or `}` on the same line as the Hebrew text. Multi-line JSX where the opening tag and text are on separate lines won't match.

**Interactive prompt only works in TTY.** `process.stdin.isTTY` gates the i18n/hardcoded question. In CI or piped input, it silently defaults to `enforceI18n: false`.

**"Slash command" not "skill" in user-facing text.** The file mechanism is a Claude Code skill (`SKILL.md`), but the project standardized on calling it a "slash command" in the README and CLI output.
