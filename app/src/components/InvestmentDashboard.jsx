import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RefreshCw } from 'lucide-react';

export default function InvestmentDashboard() {
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // 1. Fetch all transactions
      const transactions = await invoke('get_all_transactions');
      
      // 2. Calculate holdings
      const holdingMap = {};
      
      // Sort transactions by date to ensure correct order for average cost calculation
      transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

      transactions.forEach(tx => {
        if (tx.ticker && tx.shares) {
          if (!holdingMap[tx.ticker]) {
            holdingMap[tx.ticker] = {
              ticker: tx.ticker,
              shares: 0,
              costBasis: 0,
            };
          }
          
          if (tx.shares > 0) { // Buy
             holdingMap[tx.ticker].shares += tx.shares;
             holdingMap[tx.ticker].costBasis += (tx.price_per_share || 0) * tx.shares + (tx.fee || 0);
          } else { // Sell
             const currentShares = holdingMap[tx.ticker].shares;
             const currentCost = holdingMap[tx.ticker].costBasis;
             const avgCost = currentShares > 0 ? currentCost / currentShares : 0;
             
             const sharesSold = Math.abs(tx.shares);
             
             // Update shares
             holdingMap[tx.ticker].shares -= sharesSold;
             
             // Reduce cost basis by the average cost of sold shares
             holdingMap[tx.ticker].costBasis -= sharesSold * avgCost;
          }
        }
      });

      const currentHoldings = Object.values(holdingMap).filter(h => h.shares > 0.0001);
      
      if (currentHoldings.length === 0) {
        setHoldings([]);
        setLoading(false);
        return;
      }

      // 3. Fetch quotes
      const tickers = currentHoldings.map(h => h.ticker);
      const quotes = await invoke('get_stock_quotes', { tickers });
      
      // 4. Merge data
      const finalHoldings = currentHoldings.map(h => {
        const quote = quotes.find(q => q.symbol === h.ticker);
        const price = quote ? quote.regularMarketPrice : 0;
        const currentValue = h.shares * price;
        const roi = h.costBasis > 0 ? ((currentValue - h.costBasis) / h.costBasis) * 100 : 0;
        
        return {
          ...h,
          price,
          currentValue,
          roi,
          changePercent: quote ? quote.regularMarketChangePercent : 0
        };
      });

      finalHoldings.sort((a, b) => b.currentValue - a.currentValue);
      setHoldings(finalHoldings);
      
    } catch (e) {
      console.error("Error fetching investment data:", e);
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  }

  const totalValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);

  return (
    <div className="h-full flex flex-col space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Investment Dashboard</h2>
          <p className="text-slate-500 text-sm">Track your portfolio performance</p>
        </div>
        <button 
          onClick={fetchData} 
          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all duration-200"
          title="Refresh Data"
        >
          <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
            <span>Loading investment data...</span>
          </div>
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-100">
          Error: {error}
        </div>
      ) : holdings.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
          <p>No investments found.</p>
        </div>
      ) : (
        <>
          {/* Summary Card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-center transition-transform hover:scale-[1.02] duration-200">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Total Portfolio Value</h3>
                <p className="text-3xl font-bold text-slate-900">
                    €{totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-center transition-transform hover:scale-[1.02] duration-200">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Top Performer</h3>
                <p className="text-xl font-bold text-green-600 truncate">
                    {holdings.reduce((prev, current) => (prev.roi > current.roi) ? prev : current).ticker}
                    <span className="text-sm font-medium ml-2 text-slate-500">
                      ({holdings.reduce((prev, current) => (prev.roi > current.roi) ? prev : current).roi.toFixed(2)}%)
                    </span>
                </p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-center transition-transform hover:scale-[1.02] duration-200">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Total Holdings</h3>
                <p className="text-3xl font-bold text-slate-900">{holdings.length}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
            {/* TreeMap */}
            <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col min-h-[400px]">
               <h3 className="text-lg font-semibold text-slate-800 mb-4">Portfolio Heatmap</h3>
               <div className="flex-1 min-h-0 border border-slate-100 rounded-lg overflow-hidden relative">
                 <TreeMap items={holdings} totalValue={totalValue} />
               </div>
            </div>

            {/* Holdings Table */}
            <div className="bg-white p-0 rounded-xl shadow-sm border border-slate-100 flex flex-col overflow-hidden h-full max-h-[600px]">
              <div className="p-6 border-b border-slate-100">
                <h3 className="text-lg font-semibold text-slate-800">Holdings</h3>
              </div>
              <div className="overflow-auto flex-1">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr>
                      <th className="p-3 font-semibold text-slate-600">Ticker</th>
                      <th className="p-3 font-semibold text-slate-600 text-right">Value</th>
                      <th className="p-3 font-semibold text-slate-600 text-right">ROI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {holdings.map(h => (
                      <tr key={h.ticker} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3">
                          <div className="font-medium text-slate-900">{h.ticker}</div>
                          <div className="text-xs text-slate-500">{h.shares.toFixed(2)} shares</div>
                        </td>
                        <td className="p-3 text-right font-medium text-slate-700">
                          €{h.currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td className={`p-3 text-right font-medium ${h.roi >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {h.roi > 0 ? '+' : ''}{h.roi.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TreeMap({ items, totalValue }) {
  // Recursive binary split treemap
  return (
    <div className="w-full h-full relative">
      <TreeMapNode 
        items={items} 
        x={0} y={0} w={100} h={100} 
        totalValue={totalValue} 
      />
    </div>
  );
}

function TreeMapNode({ items, x, y, w, h, totalValue }) {
  if (items.length === 0) return null;

  if (items.length === 1) {
    const item = items[0];
    const percent = (item.currentValue / totalValue) * 100;
    // Color based on ROI
    // Green for positive, Red for negative. Intensity based on magnitude?
    // Let's use simple thresholds or a gradient.
    // ROI -20% to +20% mapped to color.
    const roi = item.roi;
    let bgColor;
    if (roi >= 0) {
        // Green: 0% -> #e6fffa (light), 50% -> #047857 (dark)
        const intensity = Math.min(roi / 50, 1); 
        // Simple interpolation or classes. Let's use HSL.
        // Green is approx 150 hue. Lightness 90% down to 40%.
        const lightness = 90 - (intensity * 50);
        bgColor = `hsl(150, 70%, ${lightness}%)`;
    } else {
        // Red: 0% -> #fff5f5, -50% -> #c53030
        const intensity = Math.min(Math.abs(roi) / 50, 1);
        const lightness = 90 - (intensity * 50);
        bgColor = `hsl(0, 70%, ${lightness}%)`;
    }

    return (
      <div 
        style={{ 
          position: 'absolute', 
          left: `${x}%`, 
          top: `${y}%`, 
          width: `${w}%`, 
          height: `${h}%`,
          backgroundColor: bgColor,
          border: '1px solid white',
          overflow: 'hidden'
        }}
        className="flex flex-col items-center justify-center p-1 text-xs text-center transition-all hover:opacity-90 hover:z-10 hover:scale-[1.02] cursor-pointer"
        title={`${item.ticker}: €${item.currentValue.toLocaleString()} (${item.roi.toFixed(2)}%)`}
      >
        <span className="font-bold text-gray-800">{item.ticker}</span>
        <span className="text-gray-700 hidden sm:inline">{item.roi.toFixed(1)}%</span>
      </div>
    );
  }

  // Split items into two groups
  const halfValue = items.reduce((sum, i) => sum + i.currentValue, 0) / 2;
  let currentSum = 0;
  let splitIndex = 0;
  
  for (let i = 0; i < items.length; i++) {
    if (currentSum + items[i].currentValue > halfValue && i > 0) {
      // Check if adding this item makes it closer or further from half
      const diffWith = Math.abs((currentSum + items[i].currentValue) - halfValue);
      const diffWithout = Math.abs(currentSum - halfValue);
      if (diffWith < diffWithout) {
        splitIndex = i + 1;
        currentSum += items[i].currentValue;
      } else {
        splitIndex = i;
      }
      break;
    }
    currentSum += items[i].currentValue;
    splitIndex = i + 1;
  }

  const groupA = items.slice(0, splitIndex);
  const groupB = items.slice(splitIndex);
  
  const valueA = groupA.reduce((sum, i) => sum + i.currentValue, 0);
  const valueB = groupB.reduce((sum, i) => sum + i.currentValue, 0);
  const total = valueA + valueB; // Should match sum of items

  // Split direction: Split along the longer axis
  const isVerticalSplit = w > h; // If width is larger, split vertically (left/right)

  let wA, hA, xB, yB, wB, hB;

  if (isVerticalSplit) {
    wA = (valueA / total) * w;
    hA = h;
    xB = x + wA;
    yB = y;
    wB = w - wA;
    hB = h;
  } else {
    wA = w;
    hA = (valueA / total) * h;
    xB = x;
    yB = y + hA;
    wB = w;
    hB = h - hA;
  }

  return (
    <>
      <TreeMapNode items={groupA} x={x} y={y} w={wA} h={hA} totalValue={totalValue} />
      <TreeMapNode items={groupB} x={xB} y={yB} w={wB} h={hB} totalValue={totalValue} />
    </>
  );
}
