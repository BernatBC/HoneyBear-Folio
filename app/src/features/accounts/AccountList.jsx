import PropTypes from "prop-types";
import { useState, useRef, useCallback } from "react";
import { useFormatNumber } from "../../utils/format";
import MaskedNumber from "../../components/ui/MaskedNumber";
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
  // Use ref to store dragging ID - more reliable than state on Windows WebView2
  const draggingIdRef = useRef(null);
  const lastReorder = useRef(0);

  const handleDragStart = useCallback((e, accountId) => {
    // Store in both state (for UI) and ref (for reliable access during drag)
    setDraggingId(accountId);
    draggingIdRef.current = accountId;

    // Set data transfer - required for drag to work
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(accountId));
    e.dataTransfer.setData("application/x-account-id", String(accountId));
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Setting dropEffect is critical for Windows to show correct cursor
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDragEnter = useCallback(
    (e, targetIndex) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";

      if (!onReorder) return;

      // Use ref for reliable access on Windows
      const currentDraggingId = draggingIdRef.current;
      if (!currentDraggingId) return;

      // Throttle reorder operations using event timestamp (avoids impure Date.now call during render)
      const now = e.timeStamp;
      if (now - lastReorder.current < 50) return;

      const dragIndex = accounts.findIndex((a) => a.id === currentDraggingId);
      if (dragIndex === -1 || dragIndex === targetIndex) return;

      lastReorder.current = now;

      const newItems = [...accounts];
      const item = newItems[dragIndex];
      newItems.splice(dragIndex, 1);
      newItems.splice(targetIndex, 0, item);
      onReorder(newItems);
    },
    [accounts, onReorder],
  );

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    draggingIdRef.current = null;
  }, []);

  return (
    <div className="space-y-1" onDragOver={handleDragOver} onDrop={handleDrop}>
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
            onDragOver={handleDragOver}
            onDragEnter={(e) => handleDragEnter(e, index)}
            onDrop={handleDrop}
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
                  <MaskedNumber
                    value={totalValue}
                    options={{
                      style: "currency",
                      currency: account.currency || undefined,
                    }}
                  />
                </span>
                {hasInvestments && (
                  <span className="text-[10px] opacity-80">
                    <MaskedNumber
                      value={cashBalance}
                      options={{
                        style: "currency",
                        currency: account.currency || undefined,
                      }}
                    />
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
