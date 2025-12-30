import { useState } from "react";
import PropTypes from "prop-types";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile, writeFile } from "@tauri-apps/plugin-fs";
import { X, Download, FileJson, FileSpreadsheet, FileText } from "lucide-react";
import * as XLSX from "xlsx";
import "../styles/ExportModal.css";
import { useToast } from "../contexts/toast";

export default function ExportModal({ onClose }) {
  const [format, setFormat] = useState("json");
  const [exporting, setExporting] = useState(false);
  // Toast API (safe noop provided by useToast when provider missing)
  const { showToast } = useToast();

  const handleExport = async () => {
    try {
      setExporting(true);

      // 1. Fetch Data
      const accounts = await invoke("get_accounts");
      const transactions = await invoke("get_all_transactions");

      // 2. Prepare Data based on format
      let content;
      let defaultPath = `honeybear_export_${new Date().toISOString().split("T")[0]}`;
      let filters = [];

      if (format === "json") {
        const data = {
          accounts,
          transactions,
          exportDate: new Date().toISOString(),
        };
        content = JSON.stringify(data, null, 2);
        defaultPath += ".json";
        filters = [{ name: "JSON", extensions: ["json"] }];
      } else if (format === "csv") {
        // Flatten transactions for CSV
        const headers = [
          "Date",
          "Account",
          "Payee",
          "Category",
          "Amount",
          "Notes",
          "Ticker",
          "Shares",
          "Price",
          "Fee",
        ];
        const rows = transactions.map((t) => {
          const acc = accounts.find((a) => a.id === t.account_id);
          return [
            t.date,
            acc ? acc.name : t.account_id,
            t.payee,
            t.category,
            t.amount,
            t.notes,
            t.ticker,
            t.shares,
            t.price_per_share,
            t.fee,
          ]
            .map((v) =>
              v === null || v === undefined
                ? ""
                : String(v).includes(",")
                  ? `"${v}"`
                  : v,
            )
            .join(",");
        });
        content = [headers.join(","), ...rows].join("\n");
        defaultPath += ".csv";
        filters = [{ name: "CSV", extensions: ["csv"] }];
      } else if (format === "xlsx") {
        // Use XLSX to generate buffer
        const wb = XLSX.utils.book_new();

        // Transactions Sheet
        const txData = transactions.map((t) => {
          const acc = accounts.find((a) => a.id === t.account_id);
          return {
            Date: t.date,
            Account: acc ? acc.name : t.account_id,
            Payee: t.payee,
            Category: t.category,
            Amount: t.amount,
            Notes: t.notes,
            Ticker: t.ticker,
            Shares: t.shares,
            Price: t.price_per_share,
            Fee: t.fee,
          };
        });
        const wsTx = XLSX.utils.json_to_sheet(txData);
        XLSX.utils.book_append_sheet(wb, wsTx, "Transactions");

        // Accounts Sheet
        const wsAcc = XLSX.utils.json_to_sheet(accounts);
        XLSX.utils.book_append_sheet(wb, wsAcc, "Accounts");

        // Generate binary
        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        content = new Uint8Array(wbout);
        defaultPath += ".xlsx";
        filters = [{ name: "Excel", extensions: ["xlsx"] }];
      }

      // 3. Open Save Dialog
      const filePath = await save({
        defaultPath,
        filters,
      });

      if (!filePath) {
        setExporting(false);
        return; // User cancelled
      }

      // 4. Write File
      if (format === "xlsx") {
        await writeFile(filePath, content);
      } else {
        await writeTextFile(filePath, content);
      }

      // Show success toast and close modal
      try {
        // Some OS APIs may return a path object; make sure we stringify sensibly
        const filePathStr =
          typeof filePath === "string" ? filePath : JSON.stringify(filePath);

        if (showToast) {
          showToast(`Export successful — saved to ${filePathStr}`, {
            type: "success",
          });
        } else {
          // Fallback when toast system isn't available
          alert("Export successful — saved to " + filePathStr);
        }

        onClose();
      } catch (e) {
        console.error("Export failed:", e);
        if (showToast) {
          showToast("Export failed: " + String(e), { type: "error" });
        } else {
          alert("Export failed: " + e);
        }
      } finally {
        setExporting(false);
      }
    } catch (e) {
      console.error("Export failed:", e);
      if (showToast) {
        showToast("Export failed: " + String(e), { type: "error" });
      } else {
        alert("Export failed: " + e);
      }
    } finally {
      // Ensure exporting flag is cleared even if an outer error occurs
      setExporting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <div className="modal-header">
          <h2 className="modal-title">
            <Download className="w-5 h-5 text-brand-500" />
            Export Data
          </h2>
          <button onClick={onClose} className="modal-close-button">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="modal-body">
          <label className="modal-label">Select Format</label>
          <div className="format-grid">
            <button
              onClick={() => setFormat("json")}
              className={`format-button ${
                format === "json"
                  ? "format-button-active"
                  : "format-button-inactive"
              }`}
            >
              <FileJson className="w-6 h-6 mb-2" />
              <span className="text-xs font-medium">JSON</span>
            </button>
            <button
              onClick={() => setFormat("csv")}
              className={`format-button ${
                format === "csv"
                  ? "format-button-active"
                  : "format-button-inactive"
              }`}
            >
              <FileText className="w-6 h-6 mb-2" />
              <span className="text-xs font-medium">CSV</span>
            </button>
            <button
              onClick={() => setFormat("xlsx")}
              className={`format-button ${
                format === "xlsx"
                  ? "format-button-active"
                  : "format-button-inactive"
              }`}
            >
              <FileSpreadsheet className="w-6 h-6 mb-2" />
              <span className="text-xs font-medium">Excel</span>
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button
            onClick={onClose}
            className="modal-cancel-button"
            disabled={exporting}
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="modal-export-button"
          >
            <span className="text-white">
              {exporting ? "Exporting..." : "Select Location & Export"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

ExportModal.propTypes = {
  onClose: PropTypes.func.isRequired,
};
