# HoneyBear Folio

<p align="center">
  <img src="img/icon.png" alt="HoneyBear Folio icon" width="160" />
</p>

HoneyBear Folio is a cross-platform personal finance desktop application built with Tauri (Rust backend), React (frontend), and SQLite (local database). It focuses on fast local data management (transactions, categories, budgets), clear dashboards and charts, portfolio tracking via Yahoo Finance market data, and import/export to common formats.

![HoneyBear Folio overview](img/overview.png)

## Features

- Local user management (no server-side auth required today)
- Dashboard + data visualization (spending, balances, trends)
- Transaction management (add/edit/view)
- Financial reports (summaries, budget overviews)
- Local storage in SQLite
- Portfolio tracking (positions + quotes/historical data via Yahoo Finance)
- FIRE calculator (FI number, years to FI, projections)
- Import/Export: CSV, JSON, XLSX (transactions, categories, budgets, portfolio holdings)
- Backup/export: SQLite file backup

## Tech Stack

- UI: React 18+, Tailwind CSS, Chart.js (+ `react-chartjs-2`)
- Desktop shell: Tauri
- Backend: Rust
- Database: SQLite (via `rusqlite`)
- Market data: `yahoo_finance_api` (+ `reqwest`)
- File formats:
  - CSV (`csv` crate, plus Papa Parse client-side when needed)
  - JSON (`serde`, `serde_json`)
  - XLSX (`calamine` for reading, `xlsxwriter` for writing; SheetJS optional)

## Project Structure

- `app/`: React + Vite frontend
- `app/src-tauri/`: Tauri + Rust backend
- `img/`: README assets (icon and overview image)

Key paths:

- `app/src/`: React UI
- `app/src/components/`: Main UI components (dashboards, import/export, FIRE)
- `app/src-tauri/src/`: Rust commands, DB access, market-data integration

## Development

Prerequisites:

- Node.js (for Vite/React)
- Rust toolchain (stable)
- Tauri dependencies for your OS (WebView, build tools)

Linux (Ubuntu/Debian) system deps commonly needed:

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

Run in development mode:

```bash
cd app
npm install
npm run tauri dev
```

Build a production bundle:

```bash
cd app
npm install
npm run tauri build
```

Useful scripts (from `app/package.json`):

- `npm run dev`: start Vite dev server
- `npm run build`: build frontend (Vite)
- `npm run tauri dev`: run the Tauri desktop app in dev mode
- `npm run tauri build`: create platform bundles/installers
- `npm run version:sync`: sync version into Tauri config and Cargo manifest

## Import / Export Notes

- Supported formats: CSV, JSON, XLSX.
- Intended scope: transactions, categories, budgets, and portfolio holdings.
- Security/robustness expectations:
  - Validate and sanitize imported data (schema, types, size limits).
  - Restrict disk access to user-selected paths.
  - Do not execute macros in XLSX; sanitize strings to mitigate formula injection (cells starting with `=`, `+`, `-`, `@`).

## Data Storage

- The SQLite database is stored in the OS-specific “app data” directory as `honeybear.db`.
- This path is derived from Tauri's `app_data_dir()` and created if missing.
- Typical locations (may vary by distro/OS):
  - Linux: `~/.local/share/honeybear-folio/honeybear.db` (or `$XDG_DATA_HOME/...`)
  - macOS: `~/Library/Application Support/honeybear-folio/honeybear.db`
  - Windows: `%APPDATA%\honeybear-folio\honeybear.db`

Tip: if you’re troubleshooting data issues, you can back up this file before testing imports.

## Releases / Versioning

- CI builds releases when you push a tag like `v1.2.3`.
- The release workflow syncs the tag version into:
  - `app/package.json`
  - `app/src-tauri/tauri.conf.json`
  - `app/src-tauri/Cargo.toml`

## Contributing

Contributions are welcome.

- Please read `CONTRIBUTING.md` for setup, coding conventions, and the PR checklist.
- If you’re proposing a larger feature, open an issue first so we can align on scope.

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).

## Distribution

- Package for Windows/macOS/Linux via Tauri bundling
