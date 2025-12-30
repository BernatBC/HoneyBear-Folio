import { useState, useRef } from "react";
import PropTypes from "prop-types";
import { invoke } from "@tauri-apps/api/core";
import {
  X,
  Upload,
  FileSpreadsheet,
  FileJson,
  AlertCircle,
  CheckCircle,
  ChevronDown,
} from "lucide-react";
import "../styles/SettingsModal.css";
import Papa from "papaparse";
import * as XLSX from "xlsx";

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
  });
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    success: 0,
    failed: 0,
  });
  const [accounts, setAccounts] = useState([]);
  const fileInputRef = useRef(null);

  useState(() => {
    invoke("get_accounts").then(setAccounts).catch(console.error);
  });

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    parseFile(selectedFile);
  };

  const parseFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target.result;

      if (file.name.endsWith(".csv")) {
        Papa.parse(data, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            setColumns(results.meta.fields || []);
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
          autoMapColumns(cols);
        } catch (e) {
          console.error("Failed to parse JSON import file:", e);
        }
      } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (json.length > 0) {
          const headers = json[0];

          setColumns(headers);
          autoMapColumns(headers);
        }
      }
    };

    if (file.name.endsWith(".csv") || file.name.endsWith(".json")) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  };

  const autoMapColumns = (cols) => {
    const newMapping = { ...mapping };
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
    });
    setMapping(newMapping);
  };

  const handleImport = async () => {
    // Require that an account column is indicated (CSV/XLSX) or JSON includes account fields
    if (
      !mapping.account &&
      !(file && file.name && file.name.endsWith(".json"))
    ) {
      alert("Please indicate the account column in the mapping");
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

    setProgress({ current: 0, total: rows.length, success: 0, failed: 0 });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const dateStr = row[mapping.date];
        const amountStr = row[mapping.amount];
        const payee = row[mapping.payee] || "Unknown";

        // Basic date parsing (YYYY-MM-DD preferred, but try others)
        let date = new Date(dateStr).toISOString().split("T")[0];
        if (date === "Invalid Date")
          date = new Date().toISOString().split("T")[0]; // Fallback

        // Amount parsing
        let amount = parseFloat(String(amountStr).replace(/[^0-9.-]/g, ""));
        if (isNaN(amount)) amount = 0;

        // Determine account id for this row. Priority:
        // 1) explicit mapping column selected by user
        // 2) explicit numeric account_id or accountId field in row
        // 3) account name in row matched to existing accounts
        let accountId = null;
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
          if (typeof accountField === "number") accountId = accountField;
          else if (!isNaN(parseInt(accountField)))
            accountId = parseInt(accountField);
          else if (typeof accountField === "string") {
            const match = accounts.find((a) => a.name === accountField);
            if (match) accountId = match.id;
          }
        }

        if (!accountId)
          throw new Error("No target account specified for imported row");

        await invoke("create_transaction", {
          accountId,
          date,
          payee,
          notes: row[mapping.notes] || "",
          category: row[mapping.category] || "Uncategorized",
          amount,
        });
        successCount++;
      } catch (e) {
        console.error("Row import failed:", e);
        failCount++;
      }
      setProgress({
        current: i + 1,
        total: rows.length,
        success: successCount,
        failed: failCount,
      });
    }

    setImporting(false);
    setTimeout(() => {
      onImportComplete();
      onClose();
    }, 1500);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="modal-header border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <h2 className="modal-title">
            <Upload className="w-5 h-5 text-blue-500" />
            Import Transactions
          </h2>
          <button onClick={onClose} className="modal-close-button">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="modal-body overflow-y-auto flex-1">
          {!file ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-all group"
            >
              {file && file.name && file.name.endsWith(".json") ? (
                <FileJson className="w-12 h-12 text-slate-400 dark:text-slate-600 group-hover:text-blue-500 mb-4 transition-colors" />
              ) : (
                <FileSpreadsheet className="w-12 h-12 text-slate-400 dark:text-slate-600 group-hover:text-blue-500 mb-4 transition-colors" />
              )}
              <p className="text-slate-600 dark:text-slate-300 font-medium">
                Click to upload CSV, Excel or JSON file
              </p>
              <p className="text-slate-500 dark:text-slate-500 text-sm mt-1">
                Supports .csv, .xlsx, .xls, .json
              </p>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".csv,.xlsx,.xls,.json"
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-5 h-5 text-green-500" />
                  <span className="text-slate-900 dark:text-white font-medium">{file.name}</span>
                </div>
                <button
                  onClick={() => setFile(null)}
                  className="text-slate-500 dark:text-slate-400 hover:text-red-400 text-sm"
                >
                  Change File
                </button>
              </div>

              <div className="mb-2">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Indicate which column contains the account name or ID in the
                  mappings below — this will be used to assign each imported row
                  to the correct account.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Map Columns
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  Be sure to map the <strong>account</strong> column so the
                  importer can assign each row to the right account.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {Object.keys(mapping).map((field) => (
                    <div key={field}>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-500 mb-1 capitalize">
                        {field}
                      </label>
                      <div className="relative">
                        <select
                          value={mapping[field]}
                          onChange={(e) =>
                            setMapping({ ...mapping, [field]: e.target.value })
                          }
                          className="modal-select appearance-none pr-8 text-sm"
                        >
                          <option value="">Skip</option>
                          {columns.map((col) => (
                            <option key={col} value={col}>
                              {col}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {importing && (
                <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-700 dark:text-slate-300">Importing...</span>
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
                      Success
                    </span>
                    <span className="text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {progress.failed}{" "}
                      Failed
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            disabled={importing}
          >
            Cancel
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
              {importing ? "Importing..." : "Start Import"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

ImportModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onImportComplete: PropTypes.func.isRequired,
};
