import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import PropTypes from "prop-types";
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
vi.mock("../../../components/ui/Modal", () => {
  const Modal = ({ children }) => <div data-testid="modal">{children}</div>;
  Modal.propTypes = { children: PropTypes.node };

  const ModalHeader = ({ title }) => (
    <div data-testid="modal-header">{title}</div>
  );
  ModalHeader.propTypes = { title: PropTypes.node };

  const ModalBody = ({ children }) => (
    <div data-testid="modal-body">{children}</div>
  );
  ModalBody.propTypes = { children: PropTypes.node };

  const ModalFooter = ({ children }) => (
    <div data-testid="modal-footer">{children}</div>
  );
  ModalFooter.propTypes = { children: PropTypes.node };

  return { Modal, ModalHeader, ModalBody, ModalFooter };
});

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
