import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement
);

export default function Dashboard() {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [timeRange, setTimeRange] = useState('1Y'); // 1M, 3M, 6M, 1Y, ALL

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [accs, txs] = await Promise.all([
          invoke('get_accounts'),
          invoke('get_all_transactions')
        ]);
        setAccounts(accs);
        setTransactions(txs);
      } catch (e) {
        console.error("Failed to fetch data:", e);
      }
    };
    fetchData();
  }, []);

  const chartData = useMemo(() => {
    if (accounts.length === 0) return null;

    // 1. Calculate initial balances for each account
    // current_balance = initial_balance + sum(transactions)
    // initial_balance = current_balance - sum(transactions)
    const accountInitialBalances = {};
    accounts.forEach(acc => {
      const accTxs = transactions.filter(t => t.account_id === acc.id);
      const totalChange = accTxs.reduce((sum, t) => sum + t.amount, 0);
      accountInitialBalances[acc.id] = acc.balance - totalChange;
    });

    // 2. Collect all relevant dates
    const allDates = new Set();
    const today = new Date().toISOString().split('T')[0];
    allDates.add(today);
    transactions.forEach(t => allDates.add(t.date));
    
    let sortedDates = Array.from(allDates).sort();

    // Filter dates based on timeRange
    const now = new Date();
    let cutoffDate = new Date();
    if (timeRange === '1M') cutoffDate.setMonth(now.getMonth() - 1);
    else if (timeRange === '3M') cutoffDate.setMonth(now.getMonth() - 3);
    else if (timeRange === '6M') cutoffDate.setMonth(now.getMonth() - 6);
    else if (timeRange === '1Y') cutoffDate.setFullYear(now.getFullYear() - 1);
    else cutoffDate = new Date(0); // ALL

    sortedDates = sortedDates.filter(d => new Date(d) >= cutoffDate);
    
    // Ensure we have at least the cutoff date (or first transaction date) if it's not in the list
    // But for simplicity, we just use the transaction dates + today.
    // If the range starts before the first transaction, we should ideally show a flat line.
    // Let's just stick to the dates we have for now.

    // 3. Calculate balances for each date
    // We need a map of date -> balance for each account and total.
    
    const datasets = [];
    
    // Helper to get color
    const colors = [
      'rgb(59, 130, 246)', // blue
      'rgb(16, 185, 129)', // green
      'rgb(245, 158, 11)', // amber
      'rgb(239, 68, 68)',  // red
      'rgb(139, 92, 246)', // violet
      'rgb(236, 72, 153)', // pink
      'rgb(14, 165, 233)', // sky
      'rgb(249, 115, 22)', // orange
    ];

    // Total Net Worth Dataset
    const totalData = sortedDates.map(date => {
      let total = 0;
      accounts.forEach(acc => {
          const initial = accountInitialBalances[acc.id];
          const accTxs = transactions.filter(t => t.account_id === acc.id && t.date <= date);
          const change = accTxs.reduce((sum, t) => sum + t.amount, 0);
          total += (initial + change);
      });
      return total;
    });

    datasets.push({
      label: 'Total Net Worth',
      data: totalData,
      borderColor: 'rgb(15, 23, 42)', // slate-900
      backgroundColor: 'rgba(15, 23, 42, 0.1)',
      borderWidth: 3,
      tension: 0.1,
      fill: false,
    });

    // Individual Account Datasets
    accounts.forEach((acc, index) => {
      const accData = sortedDates.map(date => {
        const initial = accountInitialBalances[acc.id];
        const accTxs = transactions.filter(t => t.account_id === acc.id && t.date <= date);
        const change = accTxs.reduce((sum, t) => sum + t.amount, 0);
        return initial + change;
      });

      const color = colors[index % colors.length];

      datasets.push({
        label: acc.name,
        data: accData,
        borderColor: color,
        backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
        borderWidth: 2,
        tension: 0.1,
        fill: false,
      });
    });

    return {
      labels: sortedDates,
      datasets: datasets
    };
  }, [accounts, transactions, timeRange]);

  const doughnutData = useMemo(() => {
    if (accounts.length === 0) return null;

    const colors = [
      'rgb(59, 130, 246)', // blue
      'rgb(16, 185, 129)', // green
      'rgb(245, 158, 11)', // amber
      'rgb(239, 68, 68)',  // red
      'rgb(139, 92, 246)', // violet
      'rgb(236, 72, 153)', // pink
      'rgb(14, 165, 233)', // sky
      'rgb(249, 115, 22)', // orange
    ];

    return {
      labels: accounts.map(a => a.name),
      datasets: [
        {
          data: accounts.map(a => a.balance),
          backgroundColor: accounts.map((_, i) => colors[i % colors.length]),
          borderColor: '#ffffff',
          borderWidth: 2,
        },
      ],
    };
  }, [accounts]);

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
      },
      title: {
        display: true,
        text: 'Asset Allocation',
      },
    },
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Net Worth Evolution',
      },
    },
    scales: {
      y: {
        beginAtZero: false,
        grid: {
            color: 'rgba(0, 0, 0, 0.05)'
        }
      },
      x: {
        grid: {
            display: false
        }
      }
    },
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
        
        <div className="flex space-x-4">
            <div className="flex bg-slate-100 rounded-md p-1">
                {['1M', '3M', '6M', '1Y', 'ALL'].map(range => (
                    <button
                        key={range}
                        onClick={() => setTimeRange(range)}
                        className={`px-3 py-1 text-xs rounded-sm transition-colors ${
                            timeRange === range 
                            ? 'bg-white shadow-sm text-blue-600 font-medium' 
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        {range}
                    </button>
                ))}
            </div>
        </div>
      </div>

      <div className="flex-1 bg-white p-6 rounded-xl shadow-sm border border-slate-100 min-h-[400px]">
        {chartData ? (
            <Line options={options} data={chartData} />
        ) : (
            <div className="h-full flex items-center justify-center text-slate-400">
                Loading data...
            </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Asset Allocation */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-[300px]">
            {doughnutData ? (
                <Doughnut options={doughnutOptions} data={doughnutData} />
            ) : (
                <div className="h-full flex items-center justify-center text-slate-400">
                    Loading data...
                </div>
            )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-center">
                <h3 className="text-sm font-medium text-slate-500 mb-2">Current Net Worth</h3>
                <p className="text-2xl font-bold text-slate-800">
                    ${accounts.reduce((sum, acc) => sum + acc.balance, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-center">
                <h3 className="text-sm font-medium text-slate-500 mb-2">Total Accounts</h3>
                <p className="text-2xl font-bold text-slate-800">{accounts.length}</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-center sm:col-span-2">
                <h3 className="text-sm font-medium text-slate-500 mb-2">Total Transactions</h3>
                <p className="text-2xl font-bold text-slate-800">{transactions.length}</p>
            </div>
        </div>
      </div>
    </div>
  );
}
