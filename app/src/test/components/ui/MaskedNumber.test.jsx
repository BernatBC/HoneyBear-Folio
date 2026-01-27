import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import MaskedNumber from "../../../components/ui/MaskedNumber";
import { usePrivacy } from "../../../contexts/privacy";
import { useFormatNumber } from "../../../utils/format";

// Mock hooks
vi.mock("../../../contexts/privacy", () => ({
  usePrivacy: vi.fn(),
}));

vi.mock("../../../utils/format", () => ({
  useFormatNumber: vi.fn(),
}));

describe("MaskedNumber", () => {
  const mockFormatNumber = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useFormatNumber.mockReturnValue(mockFormatNumber);
  });

  it("renders the formatted number when privacy mode is off", () => {
    usePrivacy.mockReturnValue({ isPrivacyMode: false });
    mockFormatNumber.mockReturnValue("$1,234.56");

    render(<MaskedNumber value={1234.56} options={{ style: "currency" }} />);

    expect(mockFormatNumber).toHaveBeenCalledWith(1234.56, {
      style: "currency",
    });
    expect(screen.getByText("$1,234.56")).toBeInTheDocument();
    // Should not have title attribute or should not depend on it for basic rendering
    const span = screen.getByText("$1,234.56");
    if (span.tagName === "SPAN" && span.className === "") { // current impl renders fragment if no classname
       // If Fragment, we can't check attribute on text node.
       // The current implementation:
       /*
       if (className) { return <span className={className} ...>{formattedValue}</span> }
       return <>{formattedValue}</>;
       */
    }
  });

  it("renders a masked number with tooltip when privacy mode is on", () => {
    usePrivacy.mockReturnValue({ isPrivacyMode: true });
    
    // When privacy is on, formatNumber is called twice. 
    // Once for display (implied that regular formatNumber respects privacy context externally, but here we mock it)
    // Wait, useFormatNumber in real code reads privacy context.
    // In our component: 
    // const formatNumber = useFormatNumber();
    // const formattedValue = formatNumber(value, options);
    // const unmaskedValue = formatNumber(value, { ...options, ignorePrivacy: true });
    
    // So we need to mock formatNumber implementation behavior or return values based on calls.
    mockFormatNumber.mockImplementation((val, opts) => {
        if (opts?.ignorePrivacy) return "$1,234.56";
        return "****";
    });

    render(<MaskedNumber value={1234.56} options={{ style: "currency" }} />);

    const el = screen.getByText("****");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("title", "$1,234.56");
    expect(el).toHaveClass("cursor-help");
  });

  it("passes className and other props to the span", () => {
    usePrivacy.mockReturnValue({ isPrivacyMode: false });
    mockFormatNumber.mockReturnValue("123");

    render(
      <MaskedNumber
        value={123}
        className="text-red-500"
        data-testid="masked-number"
      />
    );

    const el = screen.getByTestId("masked-number");
    expect(el).toHaveClass("text-red-500");
    expect(el).toHaveTextContent("123");
  });

  it("combines className with cursor-help when privacy mode is on", () => {
    usePrivacy.mockReturnValue({ isPrivacyMode: true });
    mockFormatNumber.mockImplementation((val, opts) => {
        if (opts?.ignorePrivacy) return "123";
        return "***";
    });

    render(
      <MaskedNumber
        value={123}
        className="text-blue-500"
        data-testid="masked-number"
      />
    );

    const el = screen.getByTestId("masked-number");
    expect(el).toHaveClass("text-blue-500");
    expect(el).toHaveClass("cursor-help");
    expect(el).toHaveTextContent("***");
    expect(el).toHaveAttribute("title", "123");
  });
});
