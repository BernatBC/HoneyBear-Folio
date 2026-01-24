import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CustomRateDialog from "../../../components/shared/CustomRateDialog";

// Mock i18n
vi.mock("../../../i18n/i18n", () => ({
  t: (key, params) => {
    const translations = {
      "custom_rate.title": "Set Exchange Rate",
      "custom_rate.message": `Enter exchange rate for ${params?.currency || "currency"}`,
      "confirm.cancel": "Cancel",
      "confirm.save": "Save",
    };
    return translations[key] || key;
  },
}));

describe("CustomRateDialog", () => {
  const defaultProps = {
    isOpen: true,
    currency: "EUR",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when isOpen is false", () => {
    render(<CustomRateDialog {...defaultProps} isOpen={false} />);

    expect(screen.queryByText("Set Exchange Rate")).not.toBeInTheDocument();
  });

  it("renders dialog when isOpen is true", () => {
    render(<CustomRateDialog {...defaultProps} />);

    expect(screen.getByText("Set Exchange Rate")).toBeInTheDocument();
    expect(screen.getByText(/Enter exchange rate for EUR/)).toBeInTheDocument();
  });

  it("has a number input field", () => {
    render(<CustomRateDialog {...defaultProps} />);

    const input = screen.getByPlaceholderText("0.0");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "number");
  });

  it("has Cancel and Save buttons", () => {
    render(<CustomRateDialog {...defaultProps} />);

    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is clicked", () => {
    render(<CustomRateDialog {...defaultProps} />);

    fireEvent.click(screen.getByText("Cancel"));

    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it("calls onConfirm with parsed rate when form is submitted", () => {
    render(<CustomRateDialog {...defaultProps} />);

    const input = screen.getByPlaceholderText("0.0");
    fireEvent.change(input, { target: { value: "1.25" } });
    fireEvent.click(screen.getByText("Save"));

    expect(defaultProps.onConfirm).toHaveBeenCalledWith(1.25);
  });

  it("does not call onConfirm for invalid rate", () => {
    render(<CustomRateDialog {...defaultProps} />);

    const input = screen.getByPlaceholderText("0.0");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.click(screen.getByText("Save"));

    expect(defaultProps.onConfirm).not.toHaveBeenCalled();
  });

  it("does not call onConfirm for negative rate", () => {
    render(<CustomRateDialog {...defaultProps} />);

    const input = screen.getByPlaceholderText("0.0");
    fireEvent.change(input, { target: { value: "-1" } });
    fireEvent.click(screen.getByText("Save"));

    expect(defaultProps.onConfirm).not.toHaveBeenCalled();
  });

  it("does not call onConfirm for zero rate", () => {
    render(<CustomRateDialog {...defaultProps} />);

    const input = screen.getByPlaceholderText("0.0");
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.click(screen.getByText("Save"));

    expect(defaultProps.onConfirm).not.toHaveBeenCalled();
  });

  it("handles decimal rates correctly", () => {
    render(<CustomRateDialog {...defaultProps} />);

    const input = screen.getByPlaceholderText("0.0");
    fireEvent.change(input, { target: { value: "0.85" } });
    fireEvent.click(screen.getByText("Save"));

    expect(defaultProps.onConfirm).toHaveBeenCalledWith(0.85);
  });

  it("updates input value on change", () => {
    render(<CustomRateDialog {...defaultProps} />);

    const input = screen.getByPlaceholderText("0.0");
    fireEvent.change(input, { target: { value: "1.5" } });

    expect(input.value).toBe("1.5");
  });

  it("displays the currency name in the message", () => {
    render(<CustomRateDialog {...defaultProps} currency="GBP" />);

    expect(screen.getByText(/Enter exchange rate for GBP/)).toBeInTheDocument();
  });
});
