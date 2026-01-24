import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import NumberInput from "../../../components/ui/NumberInput";

// Mock the format hooks
const mockFormatNumber = vi.fn((val) => `FORMATTED_${val}`);
const mockParseNumber = vi.fn((str) => Number(str));

vi.mock("../../../utils/format", () => ({
  useFormatNumber: () => mockFormatNumber,
  useParseNumber: () => mockParseNumber,
}));

describe("NumberInput Component", () => {
  it("renders with formatted initial value", () => {
    render(<NumberInput value={123.45} onChange={vi.fn()} placeholder="Enter amt" />);
    
    // Check if input displays the formatted value
    const input = screen.getByPlaceholderText("Enter amt");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("FORMATTED_123.45");
  });

  it("displays empty string for null/undefined value", () => {
    render(<NumberInput value={null} onChange={vi.fn()} placeholder="Enter amt" />);
    const input = screen.getByPlaceholderText("Enter amt");
    expect(input).toHaveValue("");
  });

  it("handles user typing without calling onChange immediately (local state)", () => {
    const handleChange = vi.fn();
    render(<NumberInput value={10} onChange={handleChange} placeholder="test" />);
    
    const input = screen.getByPlaceholderText("test");
    
    // Focus to enter edit mode
    fireEvent.focus(input);
    // Simulate typing
    fireEvent.change(input, { target: { value: "50" } });
    
    // Local value should update, but onChange not called yet (until blur/enter)
    expect(input).toHaveValue("50");
    expect(handleChange).not.toHaveBeenCalled();
  });

  it("calls onChange when blurred", () => {
    const handleChange = vi.fn();
    render(<NumberInput value={10} onChange={handleChange} placeholder="test" />);
    
    const input = screen.getByPlaceholderText("test");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "50" } });
    fireEvent.blur(input);

    expect(handleChange).toHaveBeenCalledWith(50);
  });

  it("calls onChange when Enter key is pressed", () => {
    const handleChange = vi.fn();
    render(<NumberInput value={10} onChange={handleChange} placeholder="test" />);
    
    const input = screen.getByPlaceholderText("test");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(handleChange).toHaveBeenCalledWith(99);
  });
});
