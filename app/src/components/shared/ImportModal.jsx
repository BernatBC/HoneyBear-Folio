import { useState, useRef, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Upload,
  FileSpreadsheet,
  FileJson,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import "../../styles/Modal.css";
import "../../styles/SettingsModal.css";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "../ui/Modal";
import "../../styles/SettingsModal.css";
import CustomSelect from "../ui/CustomSelect";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { parseNumberWithLocale } from "../../utils/format";
import { t } from "../../i18n/i18n";
import { useToast } from "../../contexts/toast";

// Get MIME type based on file extension
const getMimeType = (fileName) => {
  const ext = fileName.toLowerCase().split(".").pop();
  const mimeTypes = {
    csv: "text/csv",
    json: "application/json",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
  };
  return mimeTypes[ext] || "application/octet-stream";
};

export default function ImportModal({ onClose, onImportComplete }) {
  const [file, setFile] = useState(null);
  const [columns, setColumns] = useState([]);
  const [mapping, setMapping] = useState({
    date: "",
    payee: "",
    amount: "",
    category: "",
    notes: "",
    account: "",
    ticker: "",
    shares: "",
    price: "",
    fee: "",
    currency: "",
  });

  /* Modal JSX moved to end of function to avoid referencing refs/state before initialization */

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    success: 0,
    failed: 0,
  });
  const [accounts, setAccounts] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [parseError, setParseError] = useState(null);
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [step, setStep] = useState(0); // 0 = select file, 1 = map/review
  const { showToast } = useToast();

  // Import result details for user review
  const [importErrorsState, setImportErrorsState] = useState([]);
  const [showImportSummary, setShowImportSummary] = useState(false);

  const autoMapColumns = useCallback((cols) => {
    setMapping((prevMapping) => {
      const newMapping = { ...prevMapping };
      cols.forEach((col) => {
        const lower = col.toLowerCase();
        if (lower.includes("date")) newMapping.date = col;
        else if (
          lower.includes("payee") ||
          lower.includes("description") ||
          lower.includes("merchant")
        )
          newMapping.payee = col;
        else if (lower.includes("amount") || lower.includes("value"))
          newMapping.amount = col;
        else if (lower.includes("category")) newMapping.category = col;
        else if (lower.includes("note") || lower.includes("memo"))
          newMapping.notes = col;
        else if (lower.includes("account") || lower.includes("acc"))
          newMapping.account = col;
        else if (lower.includes("ticker") || lower.includes("symbol"))
          newMapping.ticker = col;
        else if (
          lower.includes("shares") ||
          lower.includes("quantity") ||
          lower.includes("qty")
        )
          newMapping.shares = col;
        else if (lower.includes("price")) newMapping.price = col;
        else if (lower.includes("fee") || lower.includes("commission"))
          newMapping.fee = col;
        else if (lower.includes("currency") || lower === "curr")
          newMapping.currency = col;
      });
      return newMapping;
    });
  }, []);

  const parseFile = useCallback(
    (file) => {
      // Reset previous parse state
      setParseError(null);
      setPreviewRows([]);

      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target.result;

        if (file.name.endsWith(".csv")) {
          Papa.parse(data, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
              setColumns(results.meta.fields || []);
              setPreviewRows((results.data || []).slice(0, 5));
              autoMapColumns(results.meta.fields || []);
            },
          });
        } else if (file.name.endsWith(".json")) {
          try {
            const parsed = JSON.parse(data);
            let rows = [];

            if (Array.isArray(parsed)) {
              rows = parsed;
            } else if (
              parsed.transactions &&
              Array.isArray(parsed.transactions)
            ) {
              rows = parsed.transactions;
            } else if (parsed.data && Array.isArray(parsed.data)) {
              rows = parsed.data;
            } else {
              // Unsupported JSON shape
              setColumns([]);
              setPreviewRows([]);
              setParseError(t("import.error.unsupported_json_structure"));
              autoMapColumns([]);
              return;
            }

            // Collect union of keys as columns
            const cols = Array.from(
              rows.reduce((acc, row) => {
                Object.keys(row || {}).forEach((k) => acc.add(k));
                return acc;
              }, new Set()),
            );

            setColumns(cols);
            setPreviewRows(rows.slice(0, 5));
            setParseError(null);
            autoMapColumns(cols);
          } catch (e) {
            console.error("Failed to parse JSON import file:", e);
            setParseError(
              t("import.error.failed_parse_json", {
                error: e.message || String(e),
              }),
            );
            setColumns([]);
            setPreviewRows([]);
          }
        } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
          const workbook = XLSX.read(data, { type: "binary" });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

          if (json.length > 0) {
            const headers = json[0];
            const rows = json.slice(1).map((row) => {
              const obj = {};
              headers.forEach((header, index) => {
                obj[header] = row[index];
              });
              return obj;
            });

            setColumns(headers);
            setPreviewRows(rows.slice(0, 5));
            autoMapColumns(headers);
          }
        }
      };

      if (file.name.endsWith(".csv") || file.name.endsWith(".json")) {
        reader.readAsText(file);
      } else {
        reader.readAsBinaryString(file);
      }
    },
    [autoMapColumns],
  );

  // Handle file dropped via Tauri's native drag-drop (receives file path)
  const handleFileFromPath = useCallback(
    async (filePath) => {
      try {
        // Import Tauri's file system API
        const { readFile } = await import("@tauri-apps/plugin-fs");

        // Read the file contents as bytes
        const contents = await readFile(filePath);

        // Extract file name from path
        const fileName = filePath.split(/[\\/]/).pop();

        // Create a File object from the contents
        const blob = new Blob([contents]);
        const fileObj = new File([blob], fileName, {
          type: getMimeType(fileName),
        });

        setFile(fileObj);
        parseFile(fileObj);
      } catch (err) {
        console.error("Failed to read dropped file:", err);
        setParseError(
          t("import.error.failed_read_dropped", {
            error: err.message || String(err),
          }),
        );
      }
    },
    [parseFile],
  );

  useEffect(() => {
    // Fetch accounts on mount
    invoke("get_accounts").then(setAccounts).catch(console.error);

    // Prevent background from scrolling while modal is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Listen for Tauri's native file drop events (works reliably on Linux)
    let unlistenDrop = null;
    let unlistenHover = null;
    let unlistenLeave = null;

    const setupListeners = async () => {
      // Listen for file drop
      unlistenDrop = await listen("tauri://drag-drop", (event) => {
        const paths = event.payload?.paths;
        if (paths && paths.length > 0) {
          const filePath = paths[0];
          // Check if it's a supported file type
          const validExtensions = [".csv", ".xlsx", ".xls", ".json"];
          const hasValidExtension = validExtensions.some((ext) =>
            filePath.toLowerCase().endsWith(ext),
          );
          if (hasValidExtension) {
            // Read the file from the path using fetch with file:// protocol
            handleFileFromPath(filePath);
          }
        }
        setIsDragging(false);
      });

      // Listen for drag hover (file is being dragged over window)
      unlistenHover = await listen("tauri://drag-over", () => {
        setIsDragging(true);
      });

      // Listen for drag leave
      unlistenLeave = await listen("tauri://drag-leave", () => {
        setIsDragging(false);
      });
    };

    setupListeners();

    return () => {
      // Restore previous overflow setting on unmount
      document.body.style.overflow = prevOverflow || "";
      // Cleanup Tauri event listeners
      if (unlistenDrop) unlistenDrop();
      if (unlistenHover) unlistenHover();
      if (unlistenLeave) unlistenLeave();
    };
  }, [handleFileFromPath]);

  // Browser-based drag event handlers (works on Linux GNOME)
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Ensure the drop effect is shown
    e.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set isDragging to false if we're leaving the drop zone entirely
    // Check if we're leaving to a child element
    if (e.currentTarget.contains(e.relatedTarget)) {
      return;
    }
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const droppedFile = files[0];
      const fileName = droppedFile.name.toLowerCase();
      const validExtensions = [".csv", ".xlsx", ".xls", ".json"];
      const hasValidExtension = validExtensions.some((ext) =>
        fileName.endsWith(ext),
      );

      if (hasValidExtension) {
        setFile(droppedFile);
        parseFile(droppedFile);
      }
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    parseFile(selectedFile);
  };

  const handleImport = async () => {
    // Require that an account column is indicated (CSV/XLSX) or JSON includes account fields
    if (
      !mapping.account &&
      !(file && file.name && file.name.endsWith(".json"))
    ) {
      alert(t("error.no_account_mapping"));
      return;
    }

    setImporting(true);

    // Re-parse full file to get all data
    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = e.target.result;
      let allRows = [];

      if (file.name.endsWith(".csv")) {
        Papa.parse(data, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            allRows = results.data;
            processRows(allRows);
          },
        });
      } else if (file.name.endsWith(".json")) {
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) {
            allRows = parsed;
          } else if (
            parsed.transactions &&
            Array.isArray(parsed.transactions)
          ) {
            allRows = parsed.transactions;
          } else if (parsed.data && Array.isArray(parsed.data)) {
            allRows = parsed.data;
          } else {
            allRows = [];
          }
        } catch (e) {
          console.error("Failed to parse JSON import file:", e);
          allRows = [];
        }
        processRows(allRows);
      } else {
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const headers = json[0];
        allRows = json.slice(1).map((row) => {
          const obj = {};
          headers.forEach((header, index) => {
            obj[header] = row[index];
          });
          return obj;
        });
        processRows(allRows);
      }
    };

    if (file.name.endsWith(".csv") || file.name.endsWith(".json")) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  };

  const processRows = async (rows) => {
    let successCount = 0;
    let failCount = 0;
    const importErrors = [];

    setProgress({ current: 0, total: rows.length, success: 0, failed: 0 });

    // Keep a single mutable copy of accounts for the whole import so we don't
    // repeatedly create duplicates due to async React state updates.
    let localAccounts = [...accounts];

    // Group rows by account identifier to determine account type before creation
    const rowsByAccount = new Map();
    const rowIndices = new Map();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const mappedAccountValue = mapping.account
        ? row[mapping.account]
        : undefined;
      const accountField =
        mappedAccountValue ??
        row.account_id ??
        row.accountId ??
        row.account ??
        row.account_name ??
        row.accountName;

      if (accountField) {
        const key =
          typeof accountField === "string"
            ? accountField.trim().toLowerCase()
            : String(accountField);
        if (!rowsByAccount.has(key)) {
          rowsByAccount.set(key, { identifier: accountField, rows: [] });
        }
        rowsByAccount.get(key).rows.push(row);
        if (!rowIndices.has(row)) rowIndices.set(row, i);
      } else {
        // Rows without account info
        const key = "undefined_account";
        if (!rowsByAccount.has(key)) {
          rowsByAccount.set(key, { identifier: null, rows: [] });
        }
        rowsByAccount.get(key).rows.push(row);
        if (!rowIndices.has(row)) rowIndices.set(row, i);
      }
    }

    let processedCount = 0;

    for (const [, group] of rowsByAccount) {
      const { identifier, rows: groupRows } = group;
      let accountId = null;

      if (identifier !== null) {
        if (typeof identifier === "number") {
          accountId = identifier;
        } else if (!isNaN(parseInt(identifier))) {
          accountId = parseInt(identifier);
        } else if (typeof identifier === "string") {
          const name = identifier.trim();
          // Do a case-insensitive, trimmed comparison to avoid duplicates
          let match = localAccounts.find(
            (a) => a.name && a.name.trim().toLowerCase() === name.toLowerCase(),
          );
          if (!match) {
            // Determine account kind: scan ALL rows in this group
            let isBrokerage = false;
            for (const row of groupRows) {
              // Check mapped fields
              if (
                mapping.ticker &&
                row[mapping.ticker] &&
                String(row[mapping.ticker]).trim() !== ""
              ) {
                isBrokerage = true;
                break;
              }
              if (
                mapping.shares &&
                row[mapping.shares] &&
                String(row[mapping.shares]).trim() !== ""
              ) {
                isBrokerage = true;
                break;
              }
              // Check heuristics
              const keys = Object.keys(row || {});
              for (const k of keys) {
                const lowerKey = String(k).toLowerCase();
                if (
                  [
                    "ticker",
                    "shares",
                    "symbol",
                    "quantity",
                    "price_per_share",
                  ].some((s) => lowerKey.includes(s))
                ) {
                  const val = row[k];
                  if (
                    val !== undefined &&
                    val !== null &&
                    String(val).trim() !== ""
                  ) {
                    isBrokerage = true;
                    break;
                  }
                }
              }
              if (isBrokerage) break;
            }

            const kind = isBrokerage ? "brokerage" : "cash";
            try {
              const created = await invoke("create_account", {
                name,
                balance: 0.0,
                kind,
              });
              // push to local cache (we'll update React state after the import completes)
              localAccounts.push(created);
              match = created;
            } catch (e) {
              console.error("Failed to create account for import:", e);
              // Fail all rows for this account
              for (const row of groupRows) {
                const idx = rowIndices.get(row);
                importErrors.push({
                  row: idx,
                  error: `Failed to create account '${name}': ${String(e)}`,
                });
                failCount++;
                processedCount++;
              }
              continue;
            }
          }
          if (match) accountId = match.id;
        }
      }

      for (const row of groupRows) {
        const i = rowIndices.get(row);
        try {
          if (!accountId) throw new Error(t("import.error.no_account_for_row"));

          const dateStr = row[mapping.date];
          const amountStr = row[mapping.amount];
          const payee = row[mapping.payee] || t("import.unknown_payee");

          // Robust date parsing: try JS Date, then attempt common dd/mm/yyyy or dd-mm-yyyy forms, otherwise fallback to today
          let date;
          if (dateStr === undefined || dateStr === null || dateStr === "") {
            date = new Date().toISOString().split("T")[0];
          } else {
            const parsedDate = new Date(String(dateStr));
            if (isNaN(parsedDate.getTime())) {
              // Try to normalize common separators and formats
              const normalized = String(dateStr)
                .replace(/\./g, "/")
                .replace(/-/g, "/");
              const parts = normalized.split("/");
              let altDate = null;
              if (parts.length === 3) {
                if (parts[0].length === 4) {
                  // yyyy/mm/dd
                  altDate = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
                } else {
                  // dd/mm/yyyy -> yyyy-mm-dd
                  altDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                }
              }
              if (altDate && !isNaN(altDate.getTime())) {
                date = altDate.toISOString().split("T")[0];
              } else {
                console.warn(`Invalid date for row ${i}:`, dateStr);
                date = new Date().toISOString().split("T")[0];
              }
            } else {
              date = parsedDate.toISOString().split("T")[0];
            }
          }

          // Amount parsing — import files are read using American format (dot as decimal separator)
          let amount = parseNumberWithLocale(amountStr, "en-US");
          if (isNaN(amount)) amount = 0;

          // Brokerage fields
          let ticker = mapping.ticker
            ? row[mapping.ticker]
            : row.ticker || row.symbol || row.Ticker || row.Symbol;
          let shares = mapping.shares
            ? row[mapping.shares]
            : row.shares ||
              row.quantity ||
              row.qty ||
              row.Shares ||
              row.Quantity;
          let price = mapping.price
            ? row[mapping.price]
            : row.price || row.price_per_share || row.Price;
          let fee = mapping.fee
            ? row[mapping.fee]
            : row.fee || row.commission || row.Fee;

          let currency = mapping.currency
            ? row[mapping.currency]
            : row.currency ||
              row.Currency ||
              row.curr ||
              row.currency_code ||
              row.currencyCode ||
              null;

          if (typeof shares === "string")
            shares = parseNumberWithLocale(shares, "en-US");
          if (typeof price === "string")
            price = parseNumberWithLocale(price, "en-US");
          if (typeof fee === "string")
            fee = parseNumberWithLocale(fee, "en-US");

          if (isNaN(shares)) shares = null;
          if (isNaN(price)) price = null;
          if (isNaN(fee)) fee = null;
          if (!ticker) ticker = null;

          await invoke("create_transaction", {
            args: {
              accountId,
              date,
              payee,
              notes: row[mapping.notes] || "",
              category: row[mapping.category] || "Uncategorized",
              amount,
              ticker,
              shares,
              pricePerShare: price,
              fee,
              currency: currency ? String(currency) : null,
            },
          });
          successCount++;
        } catch (e) {
          console.error(`Row ${i} import failed:`, e);
          importErrors.push({ row: i, error: String(e) });
          failCount++;
        }
        processedCount++;
        setProgress({
          current: processedCount,
          total: rows.length,
          success: successCount,
          failed: failCount,
        });
      }
    }

    // Update React state to include any accounts we created during the import
    setAccounts(localAccounts);

    setImporting(false);
    setImportErrorsState(importErrors);

    if (showToast) {
      if (failCount > 0) {
        showToast(
          `Import completed: ${successCount} succeeded, ${failCount} failed`,
          { type: "error" },
        );
        console.error("Import errors:", importErrors);
      } else {
        showToast(`${successCount} transactions imported`, { type: "success" });
      }
    }

    // Always refresh app data so created accounts/transactions appear, but keep modal open
    // when some rows failed so the user can inspect errors.
    onImportComplete();
    if (failCount === 0) {
      setTimeout(() => {
        onClose();
      }, 1500);
    } else {
      setShowImportSummary(true);
    }
  };

  // If SSR or tests, avoid touching document
  if (typeof document === "undefined") return null;

  return (
    <Modal
      onClose={onClose}
      size="4xl"
      className="!p-0 flex flex-col overflow-hidden max-h-[90vh]"
    >
      <div className="p-6 pb-0">
        <ModalHeader
          onClose={onClose}
          title={t("import.title")}
          icon={Upload}
        />
      </div>

      <ModalBody className="overflow-y-auto flex-1 px-6">
        {!file ? (
          <div
            ref={dropZoneRef}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all group ${
              isDragging
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "border-slate-300 dark:border-slate-700 hover:border-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800/50"
            }`}
          >
            {isDragging ? (
              <>
                <Upload className="w-12 h-12 text-blue-500 mb-4 animate-pulse" />
                <p className="text-blue-600 dark:text-blue-400 font-medium">
                  {t("import.drop_file_here") || "Drop file here"}
                </p>
              </>
            ) : (
              <>
                {file && file.name && file.name.endsWith(".json") ? (
                  <FileJson className="w-12 h-12 text-slate-400 dark:text-slate-600 group-hover:text-blue-500 mb-4 transition-colors" />
                ) : (
                  <FileSpreadsheet className="w-12 h-12 text-slate-400 dark:text-slate-600 group-hover:text-blue-500 mb-4 transition-colors" />
                )}
                <p className="text-slate-600 dark:text-slate-300 font-medium">
                  {t("import.drag_or_click") || t("import.click_to_upload")}
                </p>
                <p className="text-slate-500 dark:text-slate-500 text-sm mt-1">
                  {t("import.supports")}
                </p>
              </>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".csv,.xlsx,.xls,.json"
              className="hidden"
            />
          </div>
        ) : step === 1 ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-5 h-5 text-green-500" />
                <span className="text-slate-900 dark:text-white font-medium">
                  {file.name}
                </span>
              </div>
              <button
                onClick={() => setFile(null)}
                className="text-slate-500 dark:text-slate-400 hover:text-red-400 text-sm"
              >
                {t("import.change_file")}
              </button>
            </div>

            <div className="mb-2">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("import.indicate_account_column")}
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                {t("import.map_columns")}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                {t("import.be_sure_map_account")}
              </p>
              <div className="grid grid-cols-2 gap-4">
                {Object.keys(mapping).map((field) => (
                  <div key={field}>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-500 mb-1 capitalize">
                      {t(`import.field.${field}`)}
                    </label>
                    <div className="relative">
                      <CustomSelect
                        value={mapping[field]}
                        onChange={(v) => setMapping({ ...mapping, [field]: v })}
                        options={[
                          { value: "", label: t("import.skip") },
                          ...columns.map((col) => ({
                            value: col,
                            label: col,
                          })),
                        ]}
                        placeholder={t("import.select_column")}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  {t("import.preview")}
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {t("import.showing_first_rows")}
                </span>
              </div>

              {parseError ? (
                <p className="text-sm text-red-500">{parseError}</p>
              ) : previewRows && previewRows.length > 0 ? (
                <div className="overflow-x-auto bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 p-2 mt-2">
                  <table className="w-full min-w-full text-sm table-auto">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800">
                        {Object.keys(previewRows[0]).map((h) => (
                          <th
                            key={h}
                            className="text-left pr-4 text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wide"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((r, idx) => (
                        <tr
                          key={idx}
                          className="hover:bg-slate-100 dark:hover:bg-slate-800 odd:bg-white even:bg-slate-50 dark:odd:bg-slate-900 dark:even:bg-slate-800"
                        >
                          {Object.keys(previewRows[0]).map((h) => (
                            <td
                              key={h}
                              className="pr-4 text-slate-900 dark:text-white whitespace-normal break-words"
                            >
                              {String(r[h] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  {t("import.no_preview")}
                </p>
              )}
            </div>

            {importing && (
              <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-700 dark:text-slate-300">
                    {t("import.importing")}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {progress.current} / {progress.total}
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 mb-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: progress.total
                        ? `${(progress.current / progress.total) * 100}%`
                        : "0%",
                    }}
                  />
                </div>
                <div className="flex gap-4 text-xs">
                  <span className="text-green-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> {progress.success}{" "}
                    {t("import.success")}
                  </span>
                  <span className="text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {progress.failed}
                    {t("import.failed")}
                  </span>
                </div>
              </div>
            )}

            {showImportSummary &&
              importErrorsState &&
              importErrorsState.length > 0 && (
                <div className="mt-4 p-4 rounded bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200">
                  <h3 className="text-sm font-semibold mb-2">
                    {t("import.error_summary") || "Import errors"}
                  </h3>
                  <p className="text-xs mb-2">
                    {t("import.error_summary_instructions") ||
                      "Some rows failed to import. Review the first errors below and fix your file or retry."}
                  </p>
                  <div className="max-h-40 overflow-auto text-sm">
                    <ul>
                      {importErrorsState.map((err, idx) => (
                        <li key={idx} className="mb-1">
                          <span className="font-semibold">
                            Row {err.row + 1}:
                          </span>{" "}
                          {err.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-5 h-5 text-green-500" />
                <span className="text-slate-900 dark:text-white font-medium">
                  {file.name}
                </span>
              </div>
              <button
                onClick={() => {
                  setFile(null);
                  setStep(0);
                }}
                className="text-slate-500 dark:text-slate-400 hover:text-red-400 text-sm"
              >
                {t("import.change_file")}
              </button>
            </div>
            <div className="p-3 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300">
              {t("import.file_loaded_review") ||
                "File loaded — click Next to review mappings and preview"}
            </div>
          </div>
        )}
      </ModalBody>

      <div className="px-6 pb-6 pt-0">
        <ModalFooter className="mt-0 pt-4 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            disabled={importing}
          >
            {t("export.cancel")}
          </button>

          {step === 0 ? (
            <button
              onClick={() => setStep(1)}
              disabled={!file}
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <span className="text-white">{t("import.next") || "Next"}</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => setStep(0)}
                disabled={importing}
                className="px-4 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                {t("import.back") || "Back"}
              </button>

              <button
                onClick={handleImport}
                disabled={
                  !file ||
                  (!mapping.account &&
                    !(file && file.name && file.name.endsWith(".json"))) ||
                  importing
                }
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <span className="text-white">
                  {importing ? t("import.importing") : t("import.start_import")}
                </span>
              </button>
            </>
          )}
        </ModalFooter>
      </div>
    </Modal>
  );
}

ImportModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onImportComplete: PropTypes.func.isRequired,
};
