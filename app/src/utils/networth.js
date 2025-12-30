export function computeNetWorth(accounts = [], marketValues = {}) {
  if (!Array.isArray(accounts)) return 0;
  return accounts.reduce((sum, acc) => {
    if (acc && acc.kind === "brokerage") {
      return (
        sum +
        (marketValues && marketValues[acc.id] !== undefined
          ? marketValues[acc.id]
          : acc.balance || 0)
      );
    }
    return sum + (acc.balance || 0);
  }, 0);
}

export default computeNetWorth;
