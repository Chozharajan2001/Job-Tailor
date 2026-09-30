import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GhostChip } from "../components/GhostChip";

describe("GhostChip", () => {
  it("shows the age reason and nothing invented", () => {
    render(
      <GhostChip
        risk={0.72}
        reasons={["listed 90 days", "text unchanged"]}
        onStillHiring={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /still hiring/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/open 90 days/i)).toBeInTheDocument();
  });

  it("renders nothing for an untagged or clean listing", () => {
    const { container } = render(
      <GhostChip risk={undefined} reasons={[]} onStillHiring={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("calls back when the user disputes the tag", async () => {
    const onStillHiring = vi.fn();
    render(
      <GhostChip
        risk={0.9}
        reasons={["listed 200 days"]}
        onStillHiring={onStillHiring}
      />,
    );
    await fireEvent.click(
      screen.getByRole("button", { name: /still hiring/i }),
    );
    expect(onStillHiring).toHaveBeenCalledTimes(1);
  });

  it("says 'you marked this as still hiring' once overridden", () => {
    render(
      <GhostChip
        risk={0}
        reasons={["you marked this as still hiring"]}
        verdict="real"
        onStillHiring={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/you marked this as still hiring/i),
    ).toBeInTheDocument();
  });
});
