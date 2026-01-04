function toNumeric(value) {
  // Reject booleans explicitly (they can coerce to 1/0) and treat non-numeric strings as invalid
  if (typeof value === "boolean" || value === null || value === undefined) return NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

export function computeNetWorth(accounts = [], marketValues = {}) {
  if (!Array.isArray(accounts)) return 0;
  return accounts.reduce((sum, acc) => {
    if (!acc) return sum;

    const balanceNumeric = toNumeric(acc.balance);

    if (acc.kind === "brokerage") {
      const mv = toNumeric(marketValues?.[acc.id]);
      // Prefer valid numeric market value; otherwise fall back to account balance (if numeric), otherwise 0
      return sum + (Number.isNaN(mv) ? (Number.isNaN(balanceNumeric) ? 0 : balanceNumeric) : mv);
    }

    return sum + (Number.isNaN(balanceNumeric) ? 0 : balanceNumeric);
  }, 0);
}

export default computeNetWorth;
