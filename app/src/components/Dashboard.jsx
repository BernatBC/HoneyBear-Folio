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
  ArcElement,
  BarElement
} from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import '../styles/Dashboard.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement,
  BarElement
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

    const assetTypes = {};
    accounts.forEach(acc => {
        let kind = acc.kind || 'cash';
        kind = kind.toLowerCase();
        
        if (kind === 'brokerage') kind = 'Stock';
        else if (kind === 'cash') kind = 'Cash';
        else kind = kind.charAt(0).toUpperCase() + kind.slice(1);
        
        assetTypes[kind] = (assetTypes[kind] || 0) + acc.balance;
    });

    const labels = Object.keys(assetTypes);
    const data = Object.values(assetTypes);

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
      labels: labels,
      datasets: [
        {
          data: data,
          backgroundColor: labels.map((_, i) => colors[i % colors.length]),
          borderColor: '#ffffff',
          borderWidth: 2,
        },
      ],
    };
  }, [accounts]);

  const expensesByCategoryData = useMemo(() => {
    if (transactions.length === 0) return null;

    const expenses = transactions.filter(t => t.amount < 0 && t.category !== 'Transfer');
    const categoryTotals = {};

    expenses.forEach(t => {
      const cat = t.category || 'Uncategorized';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + Math.abs(t.amount);
    });

    const sortedCategories = Object.entries(categoryTotals)
      .sort(([, a], [, b]) => b - a);

    const colors = [
      'rgb(239, 68, 68)',  // red
      'rgb(249, 115, 22)', // orange
      'rgb(245, 158, 11)', // amber
      'rgb(16, 185, 129)', // green
      'rgb(14, 165, 233)', // sky
      'rgb(59, 130, 246)', // blue
      'rgb(139, 92, 246)', // violet
      'rgb(236, 72, 153)', // pink
    ];

    return {
      labels: sortedCategories.map(([cat]) => cat),
      datasets: [
        {
          data: sortedCategories.map(([, amount]) => amount),
          backgroundColor: sortedCategories.map((_, i) => colors[i % colors.length]),
          borderColor: '#ffffff',
          borderWidth: 2,
        },
      ],
    };
  }, [transactions]);

  const incomeVsExpensesData = useMemo(() => {
    if (transactions.length === 0) return null;

    // Group by month (last 6 months)
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      months.push(`${year}-${month}`);
    }

    const incomeData = new Array(6).fill(0);
    const expenseData = new Array(6).fill(0);

    transactions.forEach(t => {
      if (t.category === 'Transfer') return;
      const month = t.date.slice(0, 7);
      const index = months.indexOf(month);
      if (index !== -1) {
        if (t.amount > 0) {
          incomeData[index] += t.amount;
        } else {
          expenseData[index] += Math.abs(t.amount);
        }
      }
    });

    return {
      labels: months.map(m => {
        const [y, month] = m.split('-');
        const date = new Date(parseInt(y), parseInt(month) - 1);
        return date.toLocaleDateString('en-US', { month: 'short' });
      }),
      datasets: [
        {
          label: 'Income',
          data: incomeData,
          backgroundColor: 'rgba(16, 185, 129, 0.7)', // green
          borderRadius: 4,
        },
        {
          label: 'Expenses',
          data: expenseData,
          backgroundColor: 'rgba(239, 68, 68, 0.7)', // red
          borderRadius: 4,
        },
      ],
    };
  }, [transactions]);

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

  const expensesOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
      },
      title: {
        display: true,
        text: 'Expenses by Category',
      },
    },
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Income vs Expenses (Last 6 Months)',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
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

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        display: false, // Hide default title since we added a custom one
      },
      title: {
        display: false, // Hide default title since we added a custom one
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
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h2 className="dashboard-title">Dashboard</h2>
          <p className="dashboard-subtitle">Overview of your financial performance</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="time-range-selector">
              {['1M', '3M', '6M', '1Y', 'ALL'].map(range => (
                  <button
                      key={range}
                      onClick={() => setTimeRange(range)}
                      className={`time-range-button ${
                          timeRange === range 
                          ? 'time-range-button-active' 
                          : 'time-range-button-inactive'
                      }`}
                  >
                      {range}
                  </button>
              ))}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards-grid">
          <div className="summary-card group">
              <h3 className="summary-card-title">Current Net Worth</h3>
              <p className="summary-card-value">
                  {accounts.reduce((sum, acc) => sum + acc.balance, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </p>
          </div>
          <div className="summary-card group">
              <h3 className="summary-card-title">Total Accounts</h3>
              <p className="summary-card-value">{accounts.length}</p>
          </div>
          <div className="summary-card group">
              <h3 className="summary-card-title">Total Transactions</h3>
              <p className="summary-card-value">{transactions.length}</p>
          </div>
      </div>

      <div className="chart-container">
        <div className="chart-header">
            <h3 className="chart-title">Net Worth Evolution</h3>
            <p className="chart-subtitle">Track your financial growth over time</p>
        </div>
        <div className="chart-wrapper">
            {chartData ? (
                <Line options={options} data={chartData} />
            ) : (
                <div className="loading-container">
                  <div className="loading-content">
                    <div className="loading-spinner"></div>
                    <span className="loading-text">Loading data...</span>
                  </div>
                </div>
            )}
        </div>
      </div>

      <div className="charts-grid">
        {/* Income vs Expenses */}
        <div className="chart-card chart-card-full">
            {incomeVsExpensesData ? (
                <Bar options={barOptions} data={incomeVsExpensesData} />
            ) : (
                <div className="loading-container">
                  <div className="loading-content">
                    <div className="loading-spinner"></div>
                    <span className="loading-text">Loading data...</span>
                  </div>
                </div>
            )}
        </div>

        {/* Asset Allocation */}
        <div className="chart-card">
            {doughnutData ? (
                <Doughnut options={doughnutOptions} data={doughnutData} />
            ) : (
                <div className="loading-container">
                  <div className="loading-content">
                    <div className="loading-spinner"></div>
                    <span className="loading-text">Loading data...</span>
                  </div>
                </div>
            )}
        </div>

        {/* Expenses by Category */}
        <div className="chart-card">
            {expensesByCategoryData ? (
                <Doughnut options={expensesOptions} data={expensesByCategoryData} />
            ) : (
                <div className="loading-container">
                  <div className="loading-content">
                    <div className="loading-spinner"></div>
                    <span className="loading-text">Loading data...</span>
                  </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
