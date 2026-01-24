import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import PropTypes from "prop-types";
import { ConfirmContext, useConfirm } from "../../contexts/confirm";

// Test component to consume context
function TestComponent({ onResult }) {
  const confirm = useConfirm();
  const handleClick = async () => {
    const result = await confirm();
    onResult(result);
  };
  return <button onClick={handleClick}>Confirm</button>;
}
TestComponent.propTypes = { onResult: PropTypes.func };

describe("ConfirmContext", () => {
  describe("useConfirm", () => {
    it("returns fallback function when used outside provider", () => {
      const onResult = vi.fn();
      render(<TestComponent onResult={onResult} />);

      // Should render without crashing
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("fallback function resolves to false", async () => {
      const onResult = vi.fn();
      render(<TestComponent onResult={onResult} />);

      screen.getByRole("button").click();

      await waitFor(() => {
        expect(onResult).toHaveBeenCalledWith(false);
      });
    });

    it("returns context confirm function when used inside provider", async () => {
      const mockConfirm = vi.fn().mockResolvedValue(true);
      const contextValue = { confirm: mockConfirm };
      const onResult = vi.fn();

      render(
        <ConfirmContext.Provider value={contextValue}>
          <TestComponent onResult={onResult} />
        </ConfirmContext.Provider>,
      );

      screen.getByRole("button").click();

      await waitFor(() => {
        expect(mockConfirm).toHaveBeenCalled();
        expect(onResult).toHaveBeenCalledWith(true);
      });
    });
  });
});
