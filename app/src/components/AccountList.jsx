import PropTypes from "prop-types";
import { useFormatNumber } from "../utils/format";

export default function AccountList({
  accounts,
  kind,
  selectedId,
  onSelectAccount,
  marketValues,
  Icon,
}) {
  const filtered = accounts.filter((acc) => acc.kind === kind);
  const formatNumber = useFormatNumber();

  return (
    <div className="space-y-1">
      {filtered.map((account) => (
        <button
          key={account.id}
          onClick={() => onSelectAccount(account.id)}
          className={`sidebar-nav-item justify-between group ${
            selectedId === account.id
              ? "sidebar-nav-item-active"
              : "sidebar-nav-item-inactive"
          }`}
        >
          <div className="flex items-center gap-3">
            <Icon
              className={`sidebar-nav-icon ${
                selectedId === account.id
                  ? "sidebar-nav-icon-active"
                  : "sidebar-nav-icon-inactive"
              }`}
            />
            <span className="font-medium truncate max-w-[120px]">
              {account.name}
            </span>
          </div>
          <span
            className={`text-sm font-medium ${
              selectedId === account.id
                ? "text-blue-100"
                : "text-slate-500 group-hover:text-slate-300"
            }`}
          >
            {formatNumber(
              kind === "brokerage"
                ? marketValues && marketValues[account.id] !== undefined
                  ? marketValues[account.id]
                  : account.balance
                : account.balance,
              { style: "currency" },
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

AccountList.propTypes = {
  accounts: PropTypes.array.isRequired,
  kind: PropTypes.string.isRequired,
  selectedId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
    .isRequired,
  onSelectAccount: PropTypes.func.isRequired,
  marketValues: PropTypes.object,
  Icon: PropTypes.func.isRequired,
};
