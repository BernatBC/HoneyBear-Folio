// Helpers to compute holdings and portfolio metrics from transactions and quotes

export function buildHoldingsFromTransactions(transactions) {
  const holdingMap = {};
  let firstTradeDate = null;

  // Sort transactions by date to ensure consistent results
  const txs = [...transactions].sort(
    (a, b) => new Date(a.date) - new Date(b.date),
  );

  txs.forEach((tx) => {
    if (tx.ticker && tx.shares) {
      if (!firstTradeDate) firstTradeDate = new Date(tx.date);

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

        holdingMap[tx.ticker].shares -= sharesSold;
        holdingMap[tx.ticker].costBasis -= sharesSold * avgCost;
      }
    }
  });

  const currentHoldings = Object.values(holdingMap).filter(
    (h) => h.shares > 0.0001,
  );
  return { currentHoldings, firstTradeDate };
}

export function mergeHoldingsWithQuotes(holdings, quotes) {
  const finalHoldings = holdings.map((h) => {
    const quote = quotes.find((q) => q.symbol === h.ticker);
    const price = quote ? quote.regularMarketPrice : 0;
    const currentValue = h.shares * price;
    const roi =
      h.costBasis > 0 ? ((currentValue - h.costBasis) / h.costBasis) * 100 : 0;
    return {
      ...h,
      price,
      currentValue,
      roi,
      changePercent: quote ? quote.regularMarketChangePercent : 0,
    };
  });

  finalHoldings.sort((a, b) => b.currentValue - a.currentValue);
  return finalHoldings;
}

export function computePortfolioTotals(finalHoldings) {
  const totalValue = finalHoldings.reduce(
    (s, h) => s + (h.currentValue || 0),
    0,
  );
  const totalCostBasis = finalHoldings.reduce(
    (s, h) => s + (h.costBasis || 0),
    0,
  );
  return { totalValue, totalCostBasis };
}

export function computeNetWorthMarketValues(transactions, quotes) {
  const accountHoldings = {};
  transactions.forEach((tx) => {
    if (tx.ticker && tx.shares) {
      if (!accountHoldings[tx.account_id]) accountHoldings[tx.account_id] = {};
      if (!accountHoldings[tx.account_id][tx.ticker])
        accountHoldings[tx.account_id][tx.ticker] = 0;
      accountHoldings[tx.account_id][tx.ticker] += tx.shares;
    }
  });

  const quoteMap = {};
  quotes.forEach((q) => (quoteMap[q.symbol] = q.regularMarketPrice));

  const map = {};
  for (const [accountId, holdings] of Object.entries(accountHoldings)) {
    let val = 0;
    for (const [ticker, shares] of Object.entries(holdings)) {
      if (shares > 0.0001) {
        val +=
          shares * (quoteMap[ticker] || quoteMap[ticker.toUpperCase()] || 0);
      }
    }
    map[accountId] = val;
  }

  return map;
}
