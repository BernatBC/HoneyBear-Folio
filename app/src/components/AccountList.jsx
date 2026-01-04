import PropTypes from "prop-types";

export default function AccountList({
  accounts,
  kind,
  selectedId,
  onSelectAccount,
  marketValues,
  Icon,
}) {
  const filtered = accounts.filter((acc) => acc.kind === kind);

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
            {kind === "brokerage"
              ? new Intl.NumberFormat(undefined, {
                  style: "currency",
                  maximumFractionDigits: 0,
                }).format(
                  marketValues[account.id] !== undefined
                    ? marketValues[account.id]
                    : account.balance,
                )
              : new Intl.NumberFormat(undefined, {
                  style: "currency",
                  maximumFractionDigits: 0,
                }).format(account.balance)}
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
