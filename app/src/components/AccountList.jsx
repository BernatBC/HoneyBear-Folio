import PropTypes from "prop-types";
import { useFormatNumber } from "../utils/format";

export default function AccountList({
  accounts,
  selectedId,
  onSelectAccount,
  marketValues,
  Icon,
}) {
  const formatNumber = useFormatNumber();

  return (
    <div className="space-y-1">
      {accounts.map((account) => {
        const cashBalance = Number(account.balance);
        const marketValue =
          marketValues && marketValues[account.id] !== undefined
            ? Number(marketValues[account.id])
            : 0;
        const totalValue = cashBalance + marketValue;
        const hasInvestments = Math.abs(marketValue) > 0.01;

        const formattedTotal = formatNumber(totalValue, {
          style: "currency",
          currency: account.currency || undefined,
        });
        const formattedCash = formatNumber(cashBalance, {
          style: "currency",
          currency: account.currency || undefined,
        });

        const finalFormattedTotal =
          formattedTotal === "NaN" ? "" : formattedTotal;

        return (
          <button
            key={account.id}
            onClick={() => onSelectAccount(account.id)}
            className={`sidebar-nav-item justify-between group ${
              selectedId === account.id
                ? "sidebar-nav-item-active"
                : "sidebar-nav-item-inactive"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Icon
                className={`sidebar-nav-icon shrink-0 ${
                  selectedId === account.id
                    ? "sidebar-nav-icon-active"
                    : "sidebar-nav-icon-inactive"
                }`}
              />
              <span className="font-medium truncate">{account.name}</span>
            </div>
            <div
              className={`flex flex-col items-end shrink-0 ml-2 ${
                selectedId === account.id
                  ? "text-blue-100"
                  : "text-slate-500 group-hover:text-slate-300"
              }`}
            >
              <span
                className={`font-medium ${
                  finalFormattedTotal && finalFormattedTotal.length > 14
                    ? "text-xs"
                    : "text-sm"
                }`}
              >
                {finalFormattedTotal}
              </span>
              {hasInvestments && (
                <span className="text-[10px] opacity-80">{formattedCash}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

AccountList.propTypes = {
  accounts: PropTypes.array.isRequired,
  selectedId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
    .isRequired,
  onSelectAccount: PropTypes.func.isRequired,
  marketValues: PropTypes.object,
  Icon: PropTypes.func.isRequired,
};
