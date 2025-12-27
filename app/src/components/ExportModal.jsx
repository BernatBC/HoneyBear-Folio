import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile, writeFile } from '@tauri-apps/plugin-fs';
import { X, Download, FileJson, FileSpreadsheet, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function ExportModal({ onClose }) {
  const [format, setFormat] = useState('json');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    try {
      setExporting(true);
      
      // 1. Fetch Data
      const accounts = await invoke('get_accounts');
      const transactions = await invoke('get_all_transactions');
      
      // 2. Prepare Data based on format
      let content;
      let defaultPath = `honeybear_export_${new Date().toISOString().split('T')[0]}`;
      let filters = [];

      if (format === 'json') {
        const data = { accounts, transactions, exportDate: new Date().toISOString() };
        content = JSON.stringify(data, null, 2);
        defaultPath += '.json';
        filters = [{ name: 'JSON', extensions: ['json'] }];
      } else if (format === 'csv') {
        // Flatten transactions for CSV
        const headers = ['Date', 'Account', 'Payee', 'Category', 'Amount', 'Notes', 'Ticker', 'Shares', 'Price', 'Fee'];
        const rows = transactions.map(t => {
            const acc = accounts.find(a => a.id === t.account_id);
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
                t.fee
            ].map(v => v === null || v === undefined ? '' : String(v).includes(',') ? `"${v}"` : v).join(',');
        });
        content = [headers.join(','), ...rows].join('\n');
        defaultPath += '.csv';
        filters = [{ name: 'CSV', extensions: ['csv'] }];
      } else if (format === 'xlsx') {
        // Use XLSX to generate buffer
        const wb = XLSX.utils.book_new();
        
        // Transactions Sheet
        const txData = transactions.map(t => {
            const acc = accounts.find(a => a.id === t.account_id);
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
                Fee: t.fee
            };
        });
        const wsTx = XLSX.utils.json_to_sheet(txData);
        XLSX.utils.book_append_sheet(wb, wsTx, "Transactions");

        // Accounts Sheet
        const wsAcc = XLSX.utils.json_to_sheet(accounts);
        XLSX.utils.book_append_sheet(wb, wsAcc, "Accounts");

        // Generate binary
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        content = new Uint8Array(wbout);
        defaultPath += '.xlsx';
        filters = [{ name: 'Excel', extensions: ['xlsx'] }];
      }

      // 3. Open Save Dialog
      const filePath = await save({
        defaultPath,
        filters
      });

      if (!filePath) {
        setExporting(false);
        return; // User cancelled
      }

      // 4. Write File
      if (format === 'xlsx') {
          await writeFile(filePath, content);
      } else {
          await writeTextFile(filePath, content);
      }

      onClose();
    } catch (e) {
      console.error("Export failed:", e);
      alert("Export failed: " + e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-slate-900 w-full max-w-md rounded-xl border border-slate-700 shadow-2xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-blue-500" />
            Export Data
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 mb-8">
          <label className="block text-sm font-medium text-slate-400 mb-2">Select Format</label>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setFormat('json')}
              className={`flex flex-col items-center justify-center p-4 rounded-lg border transition-all ${
                format === 'json' 
                  ? 'bg-blue-600/20 border-blue-500 text-white' 
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <FileJson className="w-6 h-6 mb-2" />
              <span className="text-xs font-medium">JSON</span>
            </button>
            <button
              onClick={() => setFormat('csv')}
              className={`flex flex-col items-center justify-center p-4 rounded-lg border transition-all ${
                format === 'csv' 
                  ? 'bg-blue-600/20 border-blue-500 text-white' 
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <FileText className="w-6 h-6 mb-2" />
              <span className="text-xs font-medium">CSV</span>
            </button>
            <button
              onClick={() => setFormat('xlsx')}
              className={`flex flex-col items-center justify-center p-4 rounded-lg border transition-all ${
                format === 'xlsx' 
                  ? 'bg-blue-600/20 border-blue-500 text-white' 
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <FileSpreadsheet className="w-6 h-6 mb-2" />
              <span className="text-xs font-medium">Excel</span>
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
            disabled={exporting}
          >
            Cancel
          </button>
          <button 
            onClick={handleExport}
            disabled={exporting}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {exporting ? 'Exporting...' : 'Select Location & Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
