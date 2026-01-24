import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AccountModal from "../../../features/accounts/AccountModal";
import { invoke } from "@tauri-apps/api/core";

// Mock dependencies
const mockShowToast = vi.fn();

vi.mock("../../../contexts/toast", () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock("../../../hooks/useCustomRate", () => ({
  useCustomRate: () => ({
    checkAndPrompt: vi.fn().mockResolvedValue(true),
    dialog: null,
  }),
}));

vi.mock("../../../utils/format", () => ({
  useParseNumber: () => (val) => parseFloat(val),
}));

vi.mock("../../../i18n/i18n", () => ({
  t: (key) => key,
}));

vi.mock("../../../components/ui/Modal", () => ({
  Modal: ({ children, onClose }) => (
    <div data-testid="modal">
      <button onClick={onClose} data-testid="modal-close">
        Close
      </button>
      {children}
    </div>
  ),
  ModalHeader: ({ title }) => <h1>{title}</h1>,
  ModalBody: ({ children }) => <div>{children}</div>,
  ModalFooter: ({ children }) => <div>{children}</div>,
}));

// Mock CustomSelect
vi.mock("../../../components/ui/CustomSelect", () => ({
  default: ({ value, onChange, options, placeholder }) => (
    <select
      data-testid="currency-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));

describe("AccountModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders correctly in create mode", () => {
    render(
      <AccountModal onClose={vi.fn()} onUpdate={vi.fn()} isEditing={false} />,
    );

    expect(screen.getByText("account.new_account")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("account.placeholder.name"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("account.placeholder.balance"),
    ).toBeInTheDocument();
  });

  it("renders correctly in edit mode with account data", () => {
    const account = {
      id: 123,
      name: "Existing Account",
      balance: 500.5,
      currency: "USD",
    };
    render(
      <AccountModal
        onClose={vi.fn()}
        onUpdate={vi.fn()}
        isEditing={true}
        account={account}
      />,
    );

    expect(screen.getByText("account.edit_account")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Existing Account")).toBeInTheDocument();

    // Note: Balance input is disabled in edit mode usually, let's verify if implementation does that.
    // Assuming the component logic (AccountModal.jsx was read partly)
  });

  it("shows error toast when submitting empty name", () => {
    render(<AccountModal onClose={vi.fn()} onUpdate={vi.fn()} />);

    const form = screen
      .getByPlaceholderText("account.placeholder.name")
      .closest("form");
    fireEvent.submit(form);

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining("account.error.empty_name"),
      expect.objectContaining({ type: "warning" }),
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("submits create_account command with correct data", async () => {
    const onUpdate = vi.fn();
    const onClose = vi.fn();
    render(<AccountModal onClose={onClose} onUpdate={onUpdate} />);

    // Fill form
    fireEvent.change(screen.getByPlaceholderText("account.placeholder.name"), {
      target: { value: "New Bank" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("account.placeholder.balance"),
      { target: { value: "1000" } },
    );
    fireEvent.change(screen.getByTestId("currency-select"), {
      target: { value: "EUR" },
    });

    const form = screen
      .getByPlaceholderText("account.placeholder.name")
      .closest("form");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("create_account", {
        name: "New Bank",
        balance: 1000,
        currency: "EUR",
      });
      expect(mockShowToast).toHaveBeenCalledWith(
        "account.created",
        expect.anything(),
      );
      expect(onUpdate).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("submits update_account command when editing", async () => {
    const account = { id: 99, name: "Old Name", currency: "USD" };
    const onUpdate = vi.fn();
    render(
      <AccountModal
        onClose={vi.fn()}
        onUpdate={onUpdate}
        isEditing={true}
        account={account}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("Old Name"), {
      target: { value: "Updated Name" },
    });

    const form = screen.getByDisplayValue("Updated Name").closest("form");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("update_account", {
        id: 99,
        name: "Updated Name",
        currency: "USD",
      });
      expect(mockShowToast).toHaveBeenCalledWith(
        "account.updated",
        expect.anything(),
      );
    });
  });
});
