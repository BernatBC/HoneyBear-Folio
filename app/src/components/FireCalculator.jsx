import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Line } from 'react-chartjs-2';
import { Calculator, TrendingUp, DollarSign, Percent, Calendar } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function FireCalculator() {
  const [currentNetWorth, setCurrentNetWorth] = useState(0);
  const [annualExpenses, setAnnualExpenses] = useState(40000);
  const [expectedReturn, setExpectedReturn] = useState(7);
  const [withdrawalRate, setWithdrawalRate] = useState(4);
  const [annualSavings, setAnnualSavings] = useState(20000);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCurrentNetWorth();
  }, []);

  async function fetchCurrentNetWorth() {
    try {
      const accounts = await invoke('get_accounts');
      const transactions = await invoke('get_all_transactions');
      
      // Calculate market values for brokerage accounts
      const accountHoldings = {};
      const allTickers = new Set();

      transactions.forEach(tx => {
        if (tx.ticker && tx.shares) {
          if (!accountHoldings[tx.account_id]) {
            accountHoldings[tx.account_id] = {};
          }
          if (!accountHoldings[tx.account_id][tx.ticker]) {
            accountHoldings[tx.account_id][tx.ticker] = 0;
          }
          accountHoldings[tx.account_id][tx.ticker] += tx.shares;
          allTickers.add(tx.ticker);
        }
      });

      let marketValues = {};
      if (allTickers.size > 0) {
        const quotes = await invoke('get_stock_quotes', { tickers: Array.from(allTickers) });
        const quoteMap = {};
        quotes.forEach(q => {
          quoteMap[q.symbol] = q.regularMarketPrice;
        });

        for (const [accountId, holdings] of Object.entries(accountHoldings)) {
          let totalValue = 0;
          for (const [ticker, shares] of Object.entries(holdings)) {
            if (shares > 0.0001) {
               const price = quoteMap[ticker] || quoteMap[ticker.toUpperCase()] || 0;
               totalValue += shares * price;
            }
          }
          marketValues[accountId] = totalValue;
        }
      }

      const totalBalance = accounts.reduce((sum, acc) => {
        if (acc.kind === 'brokerage') {
          return sum + (marketValues[acc.id] !== undefined ? marketValues[acc.id] : acc.balance);
        }
        return sum + acc.balance;
      }, 0);

      setCurrentNetWorth(Math.round(totalBalance));
      setLoading(false);

    } catch (e) {
      console.error("Failed to fetch net worth:", e);
      setLoading(false);
    }
  }

  const { fireNumber, yearsToFire, chartData } = useMemo(() => {
    const fireNum = annualExpenses / (withdrawalRate / 100);
    
    let years = 0;
    let balance = currentNetWorth;
    const dataPoints = [balance];
    const labels = ['Year 0'];
    
    // Simulate up to 50 years
    for (let i = 1; i <= 50; i++) {
      const returns = balance * (expectedReturn / 100);
      balance = balance + returns + annualSavings;
      dataPoints.push(balance);
      labels.push(`Year ${i}`);
      
      if (balance >= fireNum && years === 0) {
        years = i;
      }
    }

    return {
      fireNumber: fireNum,
      yearsToFire: years > 0 ? years : '> 50',
      chartData: {
        labels,
        datasets: [
          {
            label: 'Projected Net Worth',
            data: dataPoints,
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.4,
          },
          {
            label: 'FIRE Target',
            data: Array(labels.length).fill(fireNum),
            borderColor: 'rgb(239, 68, 68)',
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
          }
        ]
      }
    };
  }, [currentNetWorth, annualExpenses, expectedReturn, withdrawalRate, annualSavings]);

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="h-full flex flex-col space-y-6 max-w-7xl mx-auto">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
            <Calculator className="w-8 h-8 text-blue-600" />
            FIRE Calculator
          </h1>
          <p className="text-slate-500 mt-1">Financial Independence, Retire Early</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inputs */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
          <h2 className="text-xl font-semibold text-slate-700 mb-4">Parameters</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Current Net Worth</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="number" 
                  value={currentNetWorth} 
                  onChange={(e) => setCurrentNetWorth(Number(e.target.value))}
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Annual Expenses</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="number" 
                  value={annualExpenses} 
                  onChange={(e) => setAnnualExpenses(Number(e.target.value))}
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Annual Savings</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="number" 
                  value={annualSavings} 
                  onChange={(e) => setAnnualSavings(Number(e.target.value))}
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Expected Annual Return (%)</label>
              <div className="relative">
                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="number" 
                  value={expectedReturn} 
                  onChange={(e) => setExpectedReturn(Number(e.target.value))}
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Safe Withdrawal Rate (%)</label>
              <div className="relative">
                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="number" 
                  value={withdrawalRate} 
                  onChange={(e) => setWithdrawalRate(Number(e.target.value))}
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Results & Chart */}
        <div className="lg:col-span-2 space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">FIRE Number</p>
                <p className="text-2xl font-bold text-slate-800">{formatCurrency(fireNumber)}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-full">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Time to FIRE</p>
                <p className="text-2xl font-bold text-slate-800">{yearsToFire} Years</p>
              </div>
              <div className="bg-green-100 p-3 rounded-full">
                <Calendar className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex-1 min-h-[400px]">
            <h3 className="text-lg font-semibold text-slate-700 mb-4">Projection</h3>
            <div className="h-[350px]">
              <Line 
                data={chartData} 
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'top',
                    },
                    tooltip: {
                      callbacks: {
                        label: function(context) {
                          let label = context.dataset.label || '';
                          if (label) {
                            label += ': ';
                          }
                          if (context.parsed.y !== null) {
                            label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(context.parsed.y);
                          }
                          return label;
                        }
                      }
                    }
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: {
                        callback: function(value) {
                          return '$' + value / 1000 + 'k';
                        }
                      }
                    }
                  }
                }} 
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
