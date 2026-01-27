import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import RulesList from "../../../features/rules/RulesList";
import { invoke } from "@tauri-apps/api/core";

// Mock dependencies
vi.mock("../../../i18n/i18n", () => ({
  t: (key) => key,
}));

// Mock confirm context
const mockConfirm = vi.fn();
vi.mock("../../../contexts/confirm", () => ({
  useConfirm: () => mockConfirm,
}));

// Mock icons
vi.mock("lucide-react", () => ({
  Plus: () => <span>Plus</span>,
  Trash2: () => <span>Delete</span>,
  Edit: () => <span>Edit</span>,
  Save: () => <span>Save</span>,
  GripVertical: () => <span>Drag</span>,
}));

// Mock CustomSelect
vi.mock("../../../components/ui/CustomSelect", () => ({
  default: ({ value, onChange, options, placeholder }) => (
    <select
      data-testid="select"
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

describe("RulesList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and renders rules on mount", async () => {
    const mockRules = [
      {
        id: 1,
        priority: 1,
        match_field: "payee",
        match_pattern: "Uber",
        action_field: "category",
        action_value: "Transport",
      },
      {
        id: 2,
        priority: 2,
        match_field: "description",
        match_pattern: "Salary",
        action_field: "category",
        action_value: "Income",
      },
    ];

    invoke.mockResolvedValueOnce(mockRules);

    render(<RulesList />);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("get_rules");
    });

    expect(screen.getByText(/Uber/)).toBeInTheDocument();
    expect(screen.getByText(/Salary/)).toBeInTheDocument();
  });

  it("handles rule creation", async () => {
    invoke.mockResolvedValue([]); // Initial fetch

    render(<RulesList />);

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_rules"));

    // Fill new rule form
    const conditionGroup = screen.getAllByText("rules.if")[0].closest("div");
    const patternInput = within(conditionGroup).getByPlaceholderText("Value");
    fireEvent.change(patternInput, { target: { value: "Netflix" } });

    const actionGroup = screen.getAllByText("rules.then_set")[0].closest("div");
    const valueInput = within(actionGroup).getByPlaceholderText("Value");
    fireEvent.change(valueInput, { target: { value: "Entertainment" } });

    // Find submit/add button (disambiguate from other 'add' buttons)
    const addButton = screen
      .getAllByRole("button", { name: /rules.add/ })
      .find((b) => b.getAttribute("type") === "submit");
    expect(addButton).toBeTruthy();
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        "create_rule",
        expect.objectContaining({
          matchPattern: "Netflix",
          actionValue: "Entertainment",
        }),
      );
    });
  });

  it("handles rule deletion with confirmation", async () => {
    const mockRules = [
      {
        id: 10,
        priority: 1,
        match_field: "payee",
        match_pattern: "Test Rule",
        action_field: "category",
        action_value: "Test",
      },
    ];
    invoke.mockResolvedValue(mockRules);
    mockConfirm.mockResolvedValue(true);

    render(<RulesList />);

    await waitFor(() =>
      expect(screen.getByText(/"Test Rule"/)).toBeInTheDocument(),
    );

    // Find delete button
    const deleteBtn = screen.getByText("Delete").closest("button");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalled();
      expect(invoke).toHaveBeenCalledWith("delete_rule", { id: 10 });
    });
  });
});
