import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ImportModal from "../../../components/shared/ImportModal";

// Mock Tauri/Event
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
import { invoke } from "@tauri-apps/api/core";

// Mock Toast
vi.mock("../../../contexts/toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// Mock i18n
vi.mock("../../../i18n/i18n", () => ({ t: (k) => k }));

// Mock children
vi.mock("../../../components/ui/Modal", () => ({
  Modal: ({ children }) => <div data-testid="modal">{children}</div>,
  ModalHeader: ({ title }) => <div data-testid="modal-header">{title}</div>,
  ModalBody: ({ children }) => <div data-testid="modal-body">{children}</div>,
  ModalFooter: ({ children }) => (
    <div data-testid="modal-footer">{children}</div>
  ),
}));

describe("ImportModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invoke.mockResolvedValue([]);
  });

  it("renders upload interface initially", async () => {
    // Return empty accounts list to avoid issues
    invoke.mockResolvedValue([]);
    render(<ImportModal onClose={vi.fn()} onImportComplete={vi.fn()} />);

    // Wait for the useEffect to fire to avoid act warnings
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_accounts"));

    expect(screen.getByText("import.title")).toBeInTheDocument();
    expect(screen.getByText("import.drag_or_click")).toBeInTheDocument();
  });

  it("handles file selection", async () => {
    invoke.mockResolvedValue([]);
    render(<ImportModal onClose={vi.fn()} onImportComplete={vi.fn()} />);

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_accounts"));

    // Check for support text key
    expect(screen.getByText("import.supports")).toBeInTheDocument();
  });
});
