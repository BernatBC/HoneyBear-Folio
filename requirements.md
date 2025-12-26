# Requirements Document for HoneyBear Folio
## 1. Overview

This document outlines the technology stack and dependencies for the Personal Finance Desktop Application being built with Tauri (Rust backend), React (frontend), and SQLite (local database). The app will provide features such as a dashboard with data visualization, managing transactions, and displaying financial reports.

## 2. Functional Requirements

User Authentication: Local user management (no server-side auth required for now, but potential for future updates).

Dashboard: A dynamic dashboard displaying financial data such as balances, categories, and spending.

Data Visualization: Visual representations of user finances using charts and graphs.

Transaction Management: Users can add, edit, and view their transactions.

Local Data Storage: User data is stored locally using SQLite.

Cross-Platform Support: The app must run on Windows, macOS, and Linux.

Backup & Export: Users can export their data (SQLite file) or backup the app data.

Portfolio Tracking: Track investment portfolio holdings and prices using Yahoo Finance market data.

FIRE Calculator: Include a calculator to estimate Financial Independence / Retire Early metrics (e.g., target number, safe withdrawal rate, time-to-FI) based on savings rate, expected returns, and expenses.

Import & Export: Users can import and export data in common formats like CSV, JSON, and Excel (XLSX). The scope is transactions, categories, budgets, and portfolio holdings.

## 3. Non-Functional Requirements

Performance: The app must be lightweight and responsive, especially when handling large datasets (e.g., financial transactions).

Maintainability: The app should use modern frameworks and libraries that are actively maintained to ensure long-term support.

Security: The app should encrypt sensitive data like passwords and financial transactions (using Rust libraries where applicable).

Performance: The import/export process should handle large datasets efficiently (e.g., 100k+ rows) with streaming where possible.

Maintainability: Use well-supported libraries for parsing and generating files (CSV, JSON, XLSX).

Security: Validate and sanitize imported files; restrict disk access to user-selected paths; avoid executing macros in XLSX files.

## 4. Technology Stack
### 4.1 Frontend (User Interface)

#### React:

A JavaScript library for building user interfaces.

Offers a component-based architecture and excellent state management capabilities (via Redux Toolkit, Zustand, or Context API).

React 18+: The latest version of React for improved performance and features like concurrent rendering.

#### Tailwind CSS:

A utility-first CSS framework for creating modern, responsive user interfaces.

Allows fast and flexible styling, enabling custom UI components without writing custom CSS.

#### Chart.js:

A lightweight charting library to create visualizations like bar charts, line charts, and pie charts for displaying financial data.

React wrapper for Chart.js (react-chartjs-2) will be used to integrate charting easily into React components.

### 4.2 Backend (Rust + SQLite)

#### Tauri:

A lightweight framework for building native desktop apps using web technologies (HTML, CSS, JS).

Tauri + Rust will handle the backend logic, including local file storage, accessing the SQLite database, and performing data processing tasks.

#### Rust:

The backend will be implemented in Rust for performance, safety, and speed.

Rust provides excellent support for integrating with native resources and building efficient APIs.

#### SQLite:

A self-contained, serverless SQL database engine used to store user data locally.

rusqlite will be the Rust crate used to interact with SQLite, enabling efficient storage and querying of financial data like transactions, budgets, and categories.

## 5. Dependencies
### 5.1 Frontend (React + Tauri)

- React: JavaScript library for building the user interface.

- Redux Toolkit (or Zustand): State management library.

- Tailwind CSS: For styling the app using utility-first CSS.

- Chart.js: JavaScript library for creating interactive charts and data visualizations.

- react-chartjs-2: React wrapper for Chart.js, used to integrate charts in React components.

- @tauri-apps/api: Tauri's API for integrating with the Rust backend.

- Vite: Build tool to bundle and serve the app during development.

- Papa Parse: client-side CSV parsing when needed.

- SheetJS: generating and reading XLSX files (optional; can delegate to backend).

### 5.2 Backend (Rust + Tauri)

- Tauri: Framework for bundling and running the React frontend as a native desktop app.

- rusqlite: SQLite binding for Rust, to interact with the SQLite database.

- tokio: Asynchronous runtime for handling async operations like database queries.

- yahoo_finance_api: Fetch market quotes and historical data from Yahoo Finance.

- reqwest: HTTP client used by the backend to call external APIs (e.g., Yahoo Finance).

- csv: Fast CSV parsing and writing in Rust.

- calamine and xlsxwriter: Read/write XLSX files in Rust.

- serde + serde_json: Serialize/deserialize for JSON import/export (existing).

## 6. Features Breakdown

### User Data Management:

User can add, edit, and delete transactions, categories, and budgets.

### Data Visualization:

- Display bar, pie, and line charts showing financial trends.

- Graphical representation of spending across different categories.

### Financial Reports:

Ability to generate summary reports (e.g., total spending, budget overview, etc.).

### Local Data Storage:

Data is stored locally in SQLite, ensuring that no server is required.

SQLite provides fast data access for local applications.

### Cross-Platform:

The app will work on Windows, macOS, and Linux, ensuring a broad user base.

### Portfolio Management:
- Track positions (ticker, quantity, cost basis).
- Fetch real-time or near-real-time quotes and historical data via Yahoo Finance.
- Show portfolio value, daily change, allocations, and performance over time.

### FIRE Calculator:
- Inputs: monthly income, expenses, savings rate, current portfolio value, expected real return, safe withdrawal rate.
- Outputs: FI number, years to FI, projected portfolio growth, and sensitivity analysis.

### Import/Export:
- Import transactions, categories, budgets, and portfolio holdings from CSV, JSON, and XLSX formats.
- Export data to CSV, JSON, XLSX, or full SQLite backup with filters (date range, account, category, tickers).

## 7. Testing & CI/CD

### Unit Testing:

Test React components using Jest and React Testing Library.

Test Rust functions using Rust's built-in test framework.

### End-to-End Testing:

Use Playwright to test the app’s user interface and interaction with data.

### CI/CD:

GitHub Actions will be used to automate testing and deployment.

## 8. Distribution

### Tauri Packaging:

Tauri will be used to package the app as a native executable for Windows, macOS, and Linux.

### Auto Updates:

The app can integrate Tauri’s update API to allow users to receive automatic updates.

## 9. Security Considerations

- Data Encryption: Sensitive data like passwords (if implemented) and financial information should be encrypted using Rust's encryption libraries (e.g., rust-crypto or sodiumoxide).

- Database Encryption: Consider encrypting the SQLite database or specific fields if required by the app’s privacy and security policies.

- External API Access: Validate and sanitize ticker inputs; implement rate limiting and error handling for market data requests.

- File Import Security: Reject unsupported MIME types, limit file size, validate schema, and prevent path traversal when reading/writing files.

- XLSX: Do not execute macros; strip external links; sanitize strings to prevent formula injection (e.g., prefix with ' for cells starting with =, +, -, @).