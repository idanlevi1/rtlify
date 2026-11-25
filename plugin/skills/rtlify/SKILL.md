---
name: rtlify
description: Scan and fix RTL (right-to-left) violations in the current project — physical CSS, Tailwind classes, React Native styles, unflipped icons and bidi text. Use when the user asks to check, fix or add RTL / Hebrew / Arabic / Persian support.
---

1. If `.rtlify-rules.md` does not exist in the project root, run `npx -y rtlify-ai@latest init --editors claude` first. It writes the RTL ruleset and asks no questions when not in a TTY (defaults to hardcoded-text mode). If the project uses an i18n library (react-i18next, next-intl, vue-i18n…), run it with `--i18n` instead.
2. Read `.rtlify-rules.md` and follow it for every change.
3. Run `npx -y rtlify-ai@latest check` to list violations. Pass paths (e.g. `check src/`) if the user named specific folders.
4. Fix every violation according to the rules: physical CSS → logical properties, Tailwind `ml-/pr-/text-left/…` → `ms-/pe-/text-start/…`, React Native `marginLeft` → `marginStart`, flip directional icons, wrap LTR fragments (numbers, English, dates) inside RTL text in `<bdi>`.
5. Re-run `npx -y rtlify-ai@latest check` until it reports zero violations.

Rules:
- Never extract strings to `t()` unless `.rtlify-rules.md` says the project is in i18n mode.
- Never break the build: don't introduce imports or translation keys that don't exist.
- If a flagged line is intentionally physical (a chart axis, a phone-number input), add `// rtlify-ignore` instead of changing it, and tell the user.
