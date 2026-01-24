import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Sidebar from "../../../components/layout/Sidebar";
import { usePrivacy } from "../../../contexts/privacy";
import { NumberFormatContext } from "../../../contexts/number-format";

// Mock dependencies
vi.mock("../../../i18n/i18n", () => ({ t: (k) => k }));
vi.mock("../../../utils/format", () => ({
  useFormatNumber: () => (val) => `fmt-${val}`,
}));
vi.mock("../../../utils/networth", () => ({
  computeNetWorth: () => 12345.67,
}));
vi.mock("../../../contexts/privacy", () => ({
  usePrivacy: vi.fn(),
}));

// Mock lucide icons
vi.mock("lucide-react", () => ({
  Plus: () => <span>Plus</span>,
  CreditCard: () => <span>CreditCard</span>,
  TrendingUp: () => <span>TrendingUp</span>,
  LayoutDashboard: () => <span>LayoutDashboard</span>,
  List: () => <span>List</span>,
  PieChart: () => <span>PieChart</span>,
  Calculator: () => <span>Calculator</span>,
  Download: () => <span>Download</span>,
  Upload: () => <span>Upload</span>,
  Settings: () => <span>Settings</span>,
  Eye: () => <span>Eye</span>,
  EyeOff: () => <span>EyeOff</span>,
  PanelLeftClose: () => <span>Close</span>,
  ArrowUpDown: () => <span>Sort</span>,
  BookOpenCheck: () => <span>Rules</span>,
}));

// Mock child components that might use contexts or API
vi.mock("../../../features/accounts/AccountModal", () => ({
  default: () => <div data-testid="AccountModal" />,
}));
vi.mock("../../../shared/ImportModal", () => ({
  default: () => <div data-testid="ImportModal" />,
}));
vi.mock("../../../shared/ExportModal", () => ({
  default: () => <div data-testid="ExportModal" />,
}));
vi.mock("../../../shared/SettingsModal", () => ({
  default: () => <div data-testid="SettingsModal" />,
}));
vi.mock("../../../features/accounts/AccountList", () => ({
  default: () => <div data-testid="AccountList" />,
}));

const renderWithContext = (ui) => {
  return render(
    <NumberFormatContext.Provider value={{ formatNumber: (v) => `fmt-${v}` }}>
      {ui}
    </NumberFormatContext.Provider>,
  );
};

describe("Sidebar", () => {
  const mockTogglePrivacy = vi.fn();
  const mockOnSelectAccount = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePrivacy).mockReturnValue({
      isPrivacyMode: false,
      togglePrivacyMode: mockTogglePrivacy,
    });
  });

  it("renders navigation links correctly", () => {
    renderWithContext(
      <Sidebar accounts={[]} onSelectAccount={mockOnSelectAccount} />,
    );

    expect(screen.getByText("nav.dashboard")).toBeInTheDocument();
    expect(screen.getByText("nav.investments")).toBeInTheDocument();
    expect(screen.getByText("nav.fire_calculator")).toBeInTheDocument();
    expect(screen.getByText("nav.rules")).toBeInTheDocument();
  });

  it("displays computed net worth", () => {
    renderWithContext(
      <Sidebar accounts={[]} onSelectAccount={mockOnSelectAccount} />,
    );

    // We mocked computeNetWorth to 12345.67 and formatNumber to prefix 'fmt-'
    expect(screen.getByText("fmt-12345.67")).toBeInTheDocument();
  });

  it("toggles privacy mode", () => {
    renderWithContext(
      <Sidebar accounts={[]} onSelectAccount={mockOnSelectAccount} />,
    );

    // The eye icon button
    const toggleBtn = screen.getByTitle("sidebar.hide_values");
    fireEvent.click(toggleBtn);

    expect(mockTogglePrivacy).toHaveBeenCalled();
  });

  it("renders EyeOff when privacy mode is enabled", () => {
    vi.mocked(usePrivacy).mockReturnValue({
      isPrivacyMode: true,
      togglePrivacyMode: mockTogglePrivacy,
    });

    renderWithContext(
      <Sidebar accounts={[]} onSelectAccount={mockOnSelectAccount} />,
    );
    expect(screen.getByText("EyeOff")).toBeInTheDocument();
  });

  it("navigates when clicking dashboard link", () => {
    renderWithContext(
      <Sidebar
        accounts={[]}
        onSelectAccount={mockOnSelectAccount}
        selectedId="investments"
      />,
    );

    fireEvent.click(screen.getByText("nav.dashboard"));
    expect(mockOnSelectAccount).toHaveBeenCalledWith("dashboard");
  });

  it("highlights active link", () => {
    // Need to check class names or active state style
    renderWithContext(
      <Sidebar
        accounts={[]}
        onSelectAccount={mockOnSelectAccount}
        selectedId="fire-calculator"
      />,
    );

    const link = screen.getByText("nav.fire_calculator").closest("button");
    expect(link.className).toContain("sidebar-nav-item-active");
  });
});
