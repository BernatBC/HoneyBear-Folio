import { useState, useRef } from "react";
import PropTypes from "prop-types";
import { invoke } from "@tauri-apps/api/core";
import {
  X,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import "../styles/ImportModal.css";
import "../styles/AccountDetails.css";

export default function ImportModal({ onClose, onImportComplete }) {
  const [file, setFile] = useState(null);
  const [columns, setColumns] = useState([]);
  const [mapping, setMapping] = useState({
    date: "",
    payee: "",
    amount: "",
    category: "",
    notes: "",
  });
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    success: 0,
    failed: 0,
  });
  const [targetAccountId, setTargetAccountId] = useState("");
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

    if (file.name.endsWith(".csv")) {
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
    });
    setMapping(newMapping);
  };

  const handleImport = async () => {
    if (!targetAccountId) {
      alert("Please select a target account");
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

    if (file.name.endsWith(".csv")) {
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

        await invoke("create_transaction", {
          accountId: parseInt(targetAccountId),
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
    <div className="hb-modal-overlay">
      <div className="hb-modal-card">
        <div className="hb-modal-header">
          <h2 className="hb-modal-title">
            <Upload className="w-5 h-5 text-blue-500" />
            Import Transactions
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="hb-modal-body">
          {!file ? (
            <div onClick={() => fileInputRef.current?.click()} className="hb-file-drop">
              <FileSpreadsheet className="hb-file-icon" />
              <p className="text-slate-300 font-medium">
                Click to upload CSV or Excel file
              </p>
              <p className="text-slate-500 text-sm mt-1">
                Supports .csv, .xlsx, .xls
              </p>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".csv,.xlsx,.xls"
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="hb-file-preview">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-5 h-5 text-green-500" />
                  <span className="text-white font-medium">{file.name}</span>
                </div>
                <button
                  onClick={() => setFile(null)}
                  className="hb-btn-cancel"
                >
                  Change File
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="hb-label">
                    Target Account
                  </label>
                  <select
                    value={targetAccountId}
                    onChange={(e) => setTargetAccountId(e.target.value)}
                    className="hb-select-dark"
                  >
                    <option value="">Select Account...</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.kind})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="hb-mapping-heading">
                  Map Columns
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {Object.keys(mapping).map((field) => (
                    <div key={field}>
                      <label className="hb-mapping-label">
                        {field}
                      </label>
                      <select
                        value={mapping[field]}
                        onChange={(e) =>
                          setMapping({ ...mapping, [field]: e.target.value })
                        }
                        className="hb-mapping-select"
                      >
                        <option value="">Skip</option>
                        {columns.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {importing && (
                <div className="hb-importing-box">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-300">Importing...</span>
                    <span className="text-slate-400">
                      {progress.current} / {progress.total}
                    </span>
                  </div>
                  <div className="import-progress-bar mb-2">
                    <div
                      className="import-progress-bar__fill"
                      style={{ ["--progress"]: `${(progress.current / progress.total) * 100}%` }}
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

        <div className="hb-modal-footer">
          <button onClick={onClose} className="hb-btn-cancel" disabled={importing}>
            Cancel
          </button>
          <button onClick={handleImport} disabled={!file || !targetAccountId || importing} className="hb-btn hb-btn--primary">
            <span className="text-white">{importing ? "Importing..." : "Start Import"}</span>
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
