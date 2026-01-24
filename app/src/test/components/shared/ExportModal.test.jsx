import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ExportModal from "../../../components/shared/ExportModal";

// Mock i18n
vi.mock("../../../i18n/i18n", () => ({
  t: (key) => {
    const translations = {
      "export.title": "Export Data",
      "export.select_format": "Select format",
      "export.format.json": "JSON",
      "export.format.csv": "CSV",
      "export.format.xlsx": "Excel",
      "export.select_location_export": "Export",
      "export.exporting": "Exporting...",
      "export.cancel": "Cancel",
      "export.success_saved": "Export successful",
      "export.failed": "Export failed",
    };
    return translations[key] || key;
  },
}));

// Mock Tauri APIs
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args) => mockInvoke(...args),
}));

const mockSave = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: (...args) => mockSave(...args),
}));

const mockWriteTextFile = vi.fn();
const mockWriteFile = vi.fn();
vi.mock("@tauri-apps/plugin-fs", () => ({
  writeTextFile: (...args) => mockWriteTextFile(...args),
  writeFile: (...args) => mockWriteFile(...args),
}));

// Mock toast
const mockShowToast = vi.fn();
vi.mock("../../../contexts/toast", () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

// Mock format utility
vi.mock("../../../utils/format", () => ({
  formatNumberForExport: (v) => (v != null ? String(v) : ""),
}));

// Mock XLSX
vi.mock("xlsx", () => ({
  utils: {
    book_new: vi.fn(() => ({})),
    json_to_sheet: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
  write: vi.fn(() => new Uint8Array([1, 2, 3])),
}));

describe("ExportModal", () => {
  const defaultProps = {
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_accounts") {
        return Promise.resolve([
          { id: 1, name: "Checking" },
          { id: 2, name: "Savings" },
        ]);
      }
      if (cmd === "get_all_transactions") {
        return Promise.resolve([
          { account_id: 1, date: "2024-01-15", amount: 100, payee: "Store" },
        ]);
      }
      return Promise.resolve(null);
    });
    mockSave.mockResolvedValue("/path/to/export.json");
    mockWriteTextFile.mockResolvedValue(undefined);
  });

  it("renders export modal with title", () => {
    render(<ExportModal {...defaultProps} />);

    expect(screen.getByText("Export Data")).toBeInTheDocument();
  });

  it("has format selection buttons", () => {
    render(<ExportModal {...defaultProps} />);

    // Look for format options
    expect(screen.getByText("JSON")).toBeInTheDocument();
    expect(screen.getByText("CSV")).toBeInTheDocument();
    expect(screen.getByText("Excel")).toBeInTheDocument();
  });

  it("JSON format is selected by default", () => {
    render(<ExportModal {...defaultProps} />);

    // JSON should be the default format - has active class
    const jsonButton = screen.getByText("JSON").closest("button");
    expect(jsonButton).toHaveClass("format-button-active");
  });

  it("calls onClose when cancel is clicked", () => {
    render(<ExportModal {...defaultProps} />);

    fireEvent.click(screen.getByText("Cancel"));

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("fetches accounts and transactions on export", async () => {
    render(<ExportModal {...defaultProps} />);

    fireEvent.click(screen.getByText("Export"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("get_accounts");
      expect(mockInvoke).toHaveBeenCalledWith("get_all_transactions");
    });
  });

  it("opens save dialog with JSON filter for JSON format", async () => {
    render(<ExportModal {...defaultProps} />);

    fireEvent.click(screen.getByText("Export"));

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: [{ name: "JSON", extensions: ["json"] }],
        }),
      );
    });
  });

  it("does not write file if save dialog is cancelled", async () => {
    mockSave.mockResolvedValue(null);

    render(<ExportModal {...defaultProps} />);

    fireEvent.click(screen.getByText("Export"));

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalled();
    });

    expect(mockWriteTextFile).not.toHaveBeenCalled();
  });

  it("allows selecting CSV format", () => {
    render(<ExportModal {...defaultProps} />);

    fireEvent.click(screen.getByText("CSV"));

    const csvButton = screen.getByText("CSV").closest("button");
    expect(csvButton).toHaveClass("format-button-active");
  });

  it("allows selecting Excel format", () => {
    render(<ExportModal {...defaultProps} />);

    fireEvent.click(screen.getByText("Excel"));

    const xlsxButton = screen.getByText("Excel").closest("button");
    expect(xlsxButton).toHaveClass("format-button-active");
  });
});
