import { useState, useEffect, useMemo } from "react";
import PropTypes from "prop-types";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw } from "lucide-react";
import { useFormatNumber } from "../utils/format";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Doughnut } from "react-chartjs-2";

ChartJS.register(ArcElement, Tooltip, Legend);

export default function InvestmentDashboard() {
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const formatNumber = useFormatNumber();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // 1. Fetch all transactions
      const transactions = await invoke("get_all_transactions");

      // 2. Calculate holdings
      const holdingMap = {};

      // Sort transactions by date to ensure correct order for average cost calculation
      transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

      transactions.forEach((tx) => {
        if (tx.ticker && tx.shares) {
          if (!holdingMap[tx.ticker]) {
            holdingMap[tx.ticker] = {
              ticker: tx.ticker,
              shares: 0,
              costBasis: 0,
            };
          }

          if (tx.shares > 0) {
            // Buy
            holdingMap[tx.ticker].shares += tx.shares;
            holdingMap[tx.ticker].costBasis +=
              (tx.price_per_share || 0) * tx.shares + (tx.fee || 0);
          } else {
            // Sell
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

      const currentHoldings = Object.values(holdingMap).filter(
        (h) => h.shares > 0.0001,
      );

      if (currentHoldings.length === 0) {
        setHoldings([]);
        setLoading(false);
        return;
      }

      // 3. Fetch quotes
      const tickers = currentHoldings.map((h) => h.ticker);
      const quotes = await invoke("get_stock_quotes", { tickers });

      // 4. Merge data
      const finalHoldings = currentHoldings.map((h) => {
        const quote = quotes.find((q) => q.symbol === h.ticker);
        const price = quote ? quote.regularMarketPrice : 0;
        const currentValue = h.shares * price;
        const roi =
          h.costBasis > 0
            ? ((currentValue - h.costBasis) / h.costBasis) * 100
            : 0;

        return {
          ...h,
          price,
          currentValue,
          roi,
          changePercent: quote ? quote.regularMarketChangePercent : 0,
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

  const allocationData = useMemo(() => {
    if (holdings.length === 0) return null;

    const colors = [
      "rgb(59, 130, 246)", // blue
      "rgb(16, 185, 129)", // green
      "rgb(245, 158, 11)", // amber
      "rgb(239, 68, 68)", // red
      "rgb(139, 92, 246)", // violet
      "rgb(236, 72, 153)", // pink
      "rgb(14, 165, 233)", // sky
      "rgb(249, 115, 22)", // orange
    ];

    return {
      labels: holdings.map((h) => h.ticker),
      datasets: [
        {
          data: holdings.map((h) => h.currentValue),
          backgroundColor: holdings.map((_, i) => colors[i % colors.length]),
          borderColor: "#ffffff",
          borderWidth: 2,
        },
      ],
    };
  }, [holdings]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "right",
      },
      title: {
        display: true,
        text: "Portfolio Allocation",
      },
    },
  };

  return (
    <div className="h-full flex flex-col space-y-8 max-w-7xl mx-auto pb-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
            Investment Dashboard
          </h2>
          <p className="text-slate-500 font-medium mt-1">
            Track your portfolio performance
          </p>
        </div>
        <button
          onClick={fetchData}
          className="p-2.5 text-slate-500 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all duration-200 shadow-sm border border-transparent hover:border-brand-100"
          title="Refresh Data"
        >
          <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"></div>
            <span className="text-slate-600 font-medium text-lg">
              Loading investment data...
            </span>
            <span className="text-slate-400 text-sm">
              Fetching latest market prices
            </span>
          </div>
        </div>
      ) : error ? (
        <div className="bg-gradient-to-r from-rose-50 to-red-50 text-rose-700 p-6 rounded-2xl border-2 border-rose-200 font-medium shadow-md">
          <div className="flex items-center gap-3">
            <div className="bg-rose-200 p-2 rounded-full">
              <svg
                className="w-6 h-6 text-rose-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <div className="font-bold">Error loading data</div>
              <div className="text-sm text-rose-600">{error}</div>
            </div>
          </div>
        </div>
      ) : holdings.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-16">
          <div className="bg-slate-100 p-6 rounded-2xl mb-4">
            <svg
              className="w-16 h-16 text-slate-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <p className="text-lg font-semibold text-slate-600 mb-2">
            No investments found
          </p>
          <p className="text-sm text-slate-400">
            Start adding stock transactions to track your portfolio
          </p>
        </div>
      ) : (
        <>
          {/* Summary Card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-white to-slate-50 p-6 rounded-2xl shadow-md border border-slate-200 flex flex-col justify-center transition-all duration-300 hover:shadow-xl hover:border-brand-200 hover:-translate-y-1 group cursor-pointer">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 group-hover:text-brand-600 transition-colors">
                Total Portfolio Value
              </h3>
              <p className="text-3xl font-bold text-slate-900 tracking-tight">
                {formatNumber(totalValue)} €
              </p>
            </div>
            <div className="bg-gradient-to-br from-white to-slate-50 p-6 rounded-2xl shadow-md border border-slate-200 flex flex-col justify-center transition-all duration-300 hover:shadow-xl hover:border-emerald-200 hover:-translate-y-1 group cursor-pointer">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 group-hover:text-emerald-600 transition-colors">
                Top Performer
              </h3>
              <p className="text-xl font-bold text-emerald-600 truncate tracking-tight">
                {
                  holdings.reduce((prev, current) =>
                    prev.roi > current.roi ? prev : current,
                  ).ticker
                }
                <span className="text-sm font-medium ml-2 text-slate-500">
                  (
                  {holdings
                    .reduce((prev, current) =>
                      prev.roi > current.roi ? prev : current,
                    )
                    .roi.toFixed(2)}
                  %)
                </span>
              </p>
            </div>
            <div className="bg-gradient-to-br from-white to-slate-50 p-6 rounded-2xl shadow-md border border-slate-200 flex flex-col justify-center transition-all duration-300 hover:shadow-xl hover:border-brand-200 hover:-translate-y-1 group cursor-pointer">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 group-hover:text-brand-600 transition-colors">
                Total Holdings
              </h3>
              <p className="text-3xl font-bold text-slate-900 tracking-tight">
                {holdings.length}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Portfolio Allocation */}
            <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 h-[400px] hover:shadow-lg transition-shadow duration-300">
              {allocationData ? (
                <Doughnut options={chartOptions} data={allocationData} />
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"></div>
                    <span className="text-slate-400 font-medium">
                      Loading data...
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* TreeMap */}
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-md border border-slate-200 flex flex-col h-[400px] hover:shadow-lg transition-shadow duration-300">
              <h3 className="text-lg font-semibold text-slate-800 mb-2">
                Portfolio Heatmap
              </h3>
              <p className="text-sm text-slate-500 mb-4">
                Visual representation of holdings by size and performance
              </p>
              <div className="flex-1 min-h-0 border-2 border-slate-200 rounded-xl overflow-hidden relative shadow-inner">
                <TreeMap items={holdings} totalValue={totalValue} />
              </div>
            </div>
          </div>

          {/* Holdings Table */}
          <div className="bg-white p-0 rounded-2xl shadow-md border border-slate-200 flex flex-col overflow-hidden h-full max-h-[600px] hover:shadow-lg transition-shadow duration-300">
            <div className="p-6 border-b border-slate-200 bg-slate-50/50">
              <h3 className="text-lg font-semibold text-slate-800">Holdings</h3>
              <p className="text-sm text-slate-500 mt-1">
                Detailed breakdown of your positions
              </p>
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="p-4 font-bold text-slate-600 text-xs uppercase tracking-wider">
                      Ticker
                    </th>
                    <th className="p-4 font-bold text-slate-600 text-right text-xs uppercase tracking-wider">
                      Value
                    </th>
                    <th className="p-4 font-bold text-slate-600 text-right text-xs uppercase tracking-wider">
                      ROI
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {holdings.map((h) => (
                    <tr
                      key={h.ticker}
                      className="hover:bg-slate-50 transition-colors duration-150"
                    >
                      <td className="p-4">
                        <div className="font-semibold text-slate-900">
                          {h.ticker}
                        </div>
                        <div className="text-xs text-slate-500">
                          {h.shares.toFixed(2)} shares @ {h.price.toFixed(2)} €
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="font-semibold text-slate-700">
                          {formatNumber(h.currentValue, {
                            maximumFractionDigits: 0,
                          })}{" "}
                          €
                        </div>
                        <div className="text-xs text-slate-500">
                          Cost: {h.costBasis.toFixed(0)} €
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg font-semibold text-sm ${
                            h.roi >= 0
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}
                        >
                          {h.roi > 0 ? "+" : ""}
                          {h.roi.toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
        x={0}
        y={0}
        w={100}
        h={100}
        totalValue={totalValue}
      />
    </div>
  );
}

function TreeMapNode({ items, x, y, w, h, totalValue }) {
  if (items.length === 0) return null;

  if (items.length === 1) {
    const item = items[0];
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
      const lightness = 90 - intensity * 50;
      bgColor = `hsl(150, 70%, ${lightness}%)`;
    } else {
      // Red: 0% -> #fff5f5, -50% -> #c53030
      const intensity = Math.min(Math.abs(roi) / 50, 1);
      const lightness = 90 - intensity * 50;
      bgColor = `hsl(0, 70%, ${lightness}%)`;
    }

    return (
      <div
        style={{
          position: "absolute",
          left: `${x}%`,
          top: `${y}%`,
          width: `${w}%`,
          height: `${h}%`,
          backgroundColor: bgColor,
          border: "1px solid white",
          overflow: "hidden",
        }}
        className="flex flex-col items-center justify-center p-1 text-xs text-center transition-all hover:opacity-90 hover:z-10 hover:scale-[1.02] cursor-pointer"
        title={`${item.ticker}: ${formatNumber(item.currentValue)} € (${item.roi.toFixed(2)}%)`}
      >
        <span className="font-bold text-gray-800">{item.ticker}</span>
        <span className="text-gray-700 hidden sm:inline">
          {item.roi.toFixed(1)}%
        </span>
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
      const diffWith = Math.abs(currentSum + items[i].currentValue - halfValue);
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
      <TreeMapNode
        items={groupA}
        x={x}
        y={y}
        w={wA}
        h={hA}
        totalValue={totalValue}
      />
      <TreeMapNode
        items={groupB}
        x={xB}
        y={yB}
        w={wB}
        h={hB}
        totalValue={totalValue}
      />
    </>
  );
}

TreeMap.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      ticker: PropTypes.string.isRequired,
      currentValue: PropTypes.number.isRequired,
      roi: PropTypes.number.isRequired,
    }),
  ).isRequired,
  totalValue: PropTypes.number.isRequired,
};

TreeMapNode.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      ticker: PropTypes.string.isRequired,
      currentValue: PropTypes.number.isRequired,
      roi: PropTypes.number.isRequired,
    }),
  ).isRequired,
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  w: PropTypes.number.isRequired,
  h: PropTypes.number.isRequired,
  totalValue: PropTypes.number.isRequired,
};
