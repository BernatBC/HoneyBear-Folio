import { render, screen, fireEvent, createEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import AccountList from "../../../features/accounts/AccountList";
import { NumberFormatContext } from "../../../contexts/number-format";

// Mock dependencies
vi.mock("lucide-react", () => ({
  GripVertical: () => <span data-testid="grip-icon">::</span>,
  Banknote: () => <span data-testid="banknote-icon">$</span>,
}));

// We can simply render with the context provider instead of mocking the hook
const renderWithContext = (ui, { formatNumber = (v) => String(v) } = {}) => {
  return render(
    <NumberFormatContext.Provider value={{ formatNumber }}>
      {ui}
    </NumberFormatContext.Provider>,
  );
};

describe("AccountList", () => {
  const mockAccounts = [
    { id: "1", name: "Account A", balance: 1000, currency: "USD" },
    { id: "2", name: "Account B", balance: 2000, currency: "EUR" },
  ];

  it("renders list of accounts", () => {
    renderWithContext(
      <AccountList
        accounts={mockAccounts}
        onSelectAccount={vi.fn()}
        Icon={() => <span>Icon</span>}
      />,
    );

    expect(screen.getByText("Account A")).toBeInTheDocument();
    expect(screen.getByText("Account B")).toBeInTheDocument();
  });

  it("handles drag and drop reordering", () => {
    const onReorder = vi.fn();
    renderWithContext(
      <AccountList
        accounts={mockAccounts}
        onReorder={onReorder}
        isDraggable={true}
        onSelectAccount={vi.fn()}
        Icon={() => <span>Icon</span>}
      />,
    );

    // Find the grip icons or the list items
    // The items have draggable={true} (implied by implementation details usually found in map)
    // Wait, let's check AccountList implementation again for where draggable attribute is.
    // Assuming loop generates items.

    const accountA = screen
      .getByText("Account A")
      .closest('div[draggable="true"]');
    const accountB = screen
      .getByText("Account B")
      .closest('div[draggable="true"]');

    // Simulate Drag Start on Account A
    fireEvent.dragStart(accountA, {
      dataTransfer: {
        setData: vi.fn(),
        effectAllowed: "move",
      },
    });

    // Simulate Drag Enter on Account B
    // We provide a timestamp > 50 to pass the throttle check
    fireEvent.dragEnter(accountB, {
      dataTransfer: { dropEffect: "move" },
      timeStamp: 100,
    });

    // Check if onReorder was called with swapped array
    // Original: A (id 1), B (id 2)
    // Drag A to B -> B should be first, A second (splice logic)
    expect(onReorder).toHaveBeenCalled();
    const newItems = onReorder.mock.calls[0][0];
    expect(newItems[0].id).toBe("2");
    expect(newItems[1].id).toBe("1");
  });

  it("calls onSelectAccount when clicked", () => {
    const onSelectAccount = vi.fn();
    renderWithContext(
      <AccountList
        accounts={mockAccounts}
        onSelectAccount={onSelectAccount}
        selectedId="2"
        Icon={() => <span>Icon</span>}
      />,
    );

    fireEvent.click(screen.getByText("Account A"));
    expect(onSelectAccount).toHaveBeenCalledWith("1");
  });
});
