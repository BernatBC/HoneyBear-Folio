import PropTypes from "prop-types";
import { useState } from "react";
import { useFormatNumber } from "../utils/format";
import { GripVertical } from "lucide-react";

export default function AccountList({
  accounts,
  selectedId,
  onSelectAccount,
  marketValues,
  Icon,
  onReorder,
  isDraggable,
}) {
  const formatNumber = useFormatNumber();
  const [draggingId, setDraggingId] = useState(null);

  const handleDragStart = (e, accountId) => {
    setDraggingId(accountId);
    e.dataTransfer.effectAllowed = "move";
    // Set a transparent drag image or rely on default.
    // Firefox needs data to be set.
    e.dataTransfer.setData("text/plain", accountId);
  };

  const handleDragOver = (e, targetIndex) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    if (!draggingId || !onReorder) return;

    const dragIndex = accounts.findIndex((a) => a.id === draggingId);
    if (dragIndex === -1 || dragIndex === targetIndex) return;

    const newItems = [...accounts];
    const item = newItems[dragIndex];
    newItems.splice(dragIndex, 1);
    newItems.splice(targetIndex, 0, item);
    onReorder(newItems);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
  };

  return (
    <div className="space-y-1">
      {accounts.map((account, index) => {
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

        const isDragging = draggingId === account.id;

        return (
          <div
            key={account.id}
            draggable={isDraggable}
            onDragStart={(e) => handleDragStart(e, account.id)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => e.preventDefault()}
            onDragEnd={handleDragEnd}
            className={`${isDraggable ? "cursor-move" : ""} block w-full transition-all duration-200 ${isDragging ? "opacity-50" : ""}`}
            data-index={index}
          >
            <button
              onClick={() => onSelectAccount(account.id)}
              className={`sidebar-nav-item justify-between group w-full ${
                selectedId === account.id
                  ? "sidebar-nav-item-active"
                  : "sidebar-nav-item-inactive"
              } ${isDragging ? "pointer-events-none" : ""}`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {isDraggable && (
                  <GripVertical className="w-4 h-4 text-slate-500 cursor-grab active:cursor-grabbing shrink-0" />
                )}
                {!isDraggable && (
                  <Icon
                    className={`sidebar-nav-icon shrink-0 ${
                      selectedId === account.id
                        ? "sidebar-nav-icon-active"
                        : "sidebar-nav-icon-inactive"
                    }`}
                  />
                )}
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
                  <span className="text-[10px] opacity-80">
                    {formattedCash}
                  </span>
                )}
              </div>
            </button>
          </div>
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
  onReorder: PropTypes.func,
  isDraggable: PropTypes.bool,
};
