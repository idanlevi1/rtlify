# Changelog

## 0.4.0

### Fixed
- **Windows:** `check` found no files because of a hard-coded `/` in the project-root check ([#1](https://github.com/idanlevi1/rtlify/issues/1)). Paths are now compared with `path.relative`, and output paths always use `/`.
- `init` crashed with `EISDIR` when `.clinerules` is a directory. RTLify now writes `.clinerules/rtlify.md`.
- camelCase styles (`marginLeft`, `paddingRight`, `borderLeftWidth`, `textAlign: 'left'`, …) were never flagged, including in React Native.
- Lines starting with `export` were skipped entirely.
- Tailwind `ml-auto`, `pl-px`, `-right-1/2`, `border-l`, `rounded-tl`, variant prefixes (`md:ml-4`) and `!important` (`!ml-4`) were missed.
- Classes after a URL on the same line (`href="https://…" className="ml-4"`) were dropped.
- `cond ? left : right` and CSS custom properties (`--gutter-left:`) were flagged by mistake.
- The i18n mode was silently lost if `.rtlify-rules.md` had CRLF line endings.
- Wrong versions printed by `init` (`v0.2.0`) and `help` (`v0.1.0`); `init` referred to a non-existent `.rtlifyrc.json`.
- `fix` now copies to the clipboard on Windows (`clip`) and Wayland (`wl-copy`, `xsel`).
- `init` no longer overwrites a `/rtlify` skill you edited.

### Added
- Scans `.css`, `.scss`, `.sass`, `.less`, `.vue`, `.svelte`, `.astro`, `.html`, `.mjs`, `.cjs`, `.mts`, `.cts` (skips `.d.ts` and `.min.*`).
- `check [paths...]` to scan only some folders or files.
- `check --json` for CI and tooling.
- Ignore comments: `rtlify-ignore`, `rtlify-ignore-next-line`, `rtlify-ignore-file`.
- `init --i18n` / `--hardcoded` to switch modes, `--editors claude,cursor,…` for non-interactive setup, `--no-skill`.
- Cursor: writes `.cursor/rules/rtlify.mdc` (keeps using `.cursorrules` if present). Windsurf: writes `.windsurf/rules/rtlify.md` (keeps using `.windsurfrules` if present).
- `--version`. `NO_COLOR` / `FORCE_COLOR` support; no ANSI codes when piped.
- Test suite and CI on Linux, macOS and Windows (Node 18, 20, 22).

### Changed
- `check` exits with code **2** when no scannable files are found (was 0), so a misconfigured CI job can't pass silently.
- More build folders skipped (`out`, `.output`, `.svelte-kit`, `.turbo`, `.vercel`, `.expo`, `Pods`, `vendor`, …).
