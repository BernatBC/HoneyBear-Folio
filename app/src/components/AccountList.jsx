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
        const value =
          marketValues && marketValues[account.id] !== undefined
            ? Number(account.balance) + Number(marketValues[account.id])
            : Number(account.balance);

        const formattedValue = formatNumber(value, {
          style: "currency",
          currency: account.currency || undefined,
        });
        const finalFormattedValue =
          formattedValue === "NaN" ? "" : formattedValue;

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
            <span
              className={`font-medium shrink-0 ml-2 ${
                finalFormattedValue && finalFormattedValue.length > 14
                  ? "text-xs"
                  : "text-sm"
              } ${
                selectedId === account.id
                  ? "text-blue-100"
                  : "text-slate-500 group-hover:text-slate-300"
              }`}
            >
              {finalFormattedValue}
            </span>
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
