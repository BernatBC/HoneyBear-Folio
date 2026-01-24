import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CustomSelect from "../../../components/ui/CustomSelect";

describe("CustomSelect", () => {
  const options = [
    { value: "opt1", label: "Option One" },
    { value: "opt2", label: "Option Two" },
    { value: "opt3", label: "Option Three" },
  ];

  it("renders placeholder when no value is selected", () => {
    render(
      <CustomSelect
        value=""
        onChange={() => {}}
        options={options}
        placeholder="Select something"
      />
    );
    expect(screen.getByText("Select something")).toBeInTheDocument();
  });

  it("renders selected option label", () => {
    render(
      <CustomSelect
        value="opt2"
        onChange={() => {}}
        options={options}
        placeholder="Select something"
      />
    );
    expect(screen.getByText("Option Two")).toBeInTheDocument();
  });

  it("opens menu on click and displays options", async () => {
    render(
      <CustomSelect
        value=""
        onChange={() => {}}
        options={options}
        placeholder="Select something"
      />
    );

    const trigger = screen.getByText("Select something");
    fireEvent.click(trigger);

    // Options are rendered in a portal, but screen queries should find them
    expect(screen.getAllByText("Option One")).toHaveLength(1);
    expect(screen.getAllByText("Option Two")).toHaveLength(1);
    expect(screen.getAllByText("Option Three")).toHaveLength(1);
  });

  it("calls onChange when an option is clicked", async () => {
    const handleChange = vi.fn();
    render(
      <CustomSelect
        value=""
        onChange={handleChange}
        options={options}
        placeholder="Select something"
      />
    );

    const trigger = screen.getByText("Select something");
    fireEvent.click(trigger);

    const option = screen.getByText("Option Two");
    fireEvent.click(option);

    expect(handleChange).toHaveBeenCalledWith("opt2");
  });

  it("filters options when typing in search", async () => {
    const user = userEvent.setup();
    render(
      <CustomSelect
        value=""
        onChange={() => {}}
        options={options}
        placeholder="Select something"
      />
    );

    const trigger = screen.getByText("Select something");
    await user.click(trigger);

    // Find search input and type "Two"
    const searchInput = screen.getByRole("textbox");
    await user.type(searchInput, "Two");

    expect(screen.getByText("Option Two")).toBeInTheDocument();
    expect(screen.queryByText("Option One")).not.toBeInTheDocument();
  });

  it("clears selection when value is not in options", () => {
    render(
      <CustomSelect
        value="opt99"
        onChange={() => {}}
        options={options}
        placeholder="Select something"
      />
    );
    expect(screen.getByText("Select something")).toBeInTheDocument();
  });
});
