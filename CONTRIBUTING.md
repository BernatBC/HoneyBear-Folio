# Contributing to HoneyBear Folio

Thanks for your interest in contributing.

## Ways to contribute

- Report bugs (include steps to reproduce, expected vs actual behavior, OS, and screenshots if relevant)
- Suggest enhancements (describe the user goal and any UX constraints)
- Improve docs (README, import/export notes, troubleshooting)
- Submit pull requests (bug fixes, refactors, features)

## Development setup

Prerequisites:

- Bun v1.3.6+
- Rust toolchain (stable)
- Tauri system dependencies (WebView/build tools)

Linux (Ubuntu/Debian) system deps commonly needed:

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

Run the app in dev mode:

```bash
cd app
bun install
bun run tauri dev
```

Build a production bundle:

```bash
cd app
bun run tauri build
```

## Project layout (quick map)

- `app/src/`: React UI
- `app/src/components/`: UI components (dashboards, import/export, calculators)
- `app/src-tauri/src/`: Rust backend (commands, SQLite, market-data)

## Code style & conventions

- Keep changes focused; avoid drive-by reformatting.
- Rust:
  - Format with `cargo fmt`
  - Prefer running `cargo clippy` before opening a PR
- Frontend:
  - Keep component structure consistent with existing patterns
  - Prefer small, readable functions and explicit state updates

If you introduce a new dependency, explain why in the PR description.

## Data & security considerations

This app is a personal finance tool.

- Do not commit any personal data or exported files.
- Imports should validate schema, types, and bounds; treat all input as untrusted.
- When writing XLSX/CSV exports, mitigate formula injection by prefixing or sanitizing cells that begin with `=`, `+`, `-`, or `@`.

## Pull request checklist

Before requesting review:

- The app starts in dev mode (`bun run tauri dev`).
- Frontend builds (`bun run build`).
- Rust code formats (`cargo fmt`) and is clean under `cargo clippy` (when practical).
- UI changes include screenshots.
- Import/export changes include sample files and edge cases.

## Versioning / releases

Releases are created by pushing a git tag like `v1.2.3`.

The release workflow syncs that version into:

- `app/package.json`
- `app/src-tauri/tauri.conf.json`
- `app/src-tauri/Cargo.toml`
