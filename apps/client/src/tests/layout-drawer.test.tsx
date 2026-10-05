import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";

/**
 * Node 25 exposes a native `localStorage` that throws unless the process was
 * started with --localstorage-file, and it shadows jsdom's. Layout pulls in the
 * auth store, whose zustand persist middleware writes at import time, so the
 * in-memory Storage has to exist before the import.
 */
const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => memory.clear(),
    key: () => null,
    get length() {
      return memory.size;
    },
  },
});

const { default: Layout } = await import("../components/layout/Layout.js");

/**
 * C-1: at 375px the fixed w-64 sidebar leaves the content pane 119px wide
 * while its own content needs 298px, and there is no way to hide the sidebar.
 * Measured in a real browser (Chromium, http://localhost):
 *   aside 256px = 68% of viewport, main 119px, main scrollWidth 298px,
 *   computed min-width on <main> was "auto", hamburger probe found no toggle.
 *
 * jsdom cannot evaluate Tailwind's `md:` breakpoints, so these tests pin the
 * interaction contract only — that a toggle exists, is named, announces its
 * state, closes on Escape and on navigation, and that <main> is allowed to
 * shrink below its content. The responsive geometry itself is verified with
 * the browser probe quoted above, re-run after the change.
 */
function renderShell() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route path="dashboard" element={<div>Dashboard content</div>} />
            <Route path="tracker" element={<div>Tracker content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function toggle() {
  return screen.getByRole("button", { name: /navigation/i });
}

describe("C-1 navigation toggle", () => {
  it("names the control and points it at the sidebar it controls", () => {
    renderShell();
    const button = toggle();
    expect(button).toHaveAttribute("aria-label", "Open navigation");
    expect(button).toHaveAttribute("aria-expanded", "false");
    const controls = button.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls as string)).toBe(
      document.querySelector("aside"),
    );
  });

  it("announces the opened state and shows a backdrop it can be dismissed by", () => {
    renderShell();
    fireEvent.click(toggle());

    expect(toggle()).toHaveAttribute("aria-expanded", "true");

    const backdrop = Array.from(
      document.querySelectorAll('[aria-hidden="true"]'),
    ).find((el) => el !== document.querySelector("aside"));
    expect(backdrop).toBeDefined();
    if (!backdrop) return;

    fireEvent.click(backdrop);
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on Escape and returns focus to the toggle", () => {
    renderShell();
    const button = toggle();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(window, { key: "Escape" });

    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(button);
  });

  it("closes after navigating, so the drawer never covers the page", () => {
    renderShell();
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("link", { name: /tracker/i }));

    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps every destination reachable from the sidebar", () => {
    renderShell();
    for (const label of [
      /dashboard/i,
      /profile/i,
      /jobs/i,
      /tailor resume/i,
      /tracker/i,
      /analytics/i,
    ]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("keeps the closed drawer out of the tab order on small screens", () => {
    // jsdom ships no matchMedia. The stub reports "not md", i.e. a phone.
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });

    try {
      renderShell();
      const aside = document.querySelector("aside");

      // -translate-x-full hides it visually but leaves it focusable, so a
      // keyboard user would tab into an off-screen nav. It must be inert.
      expect(aside).toHaveAttribute("inert");
      expect(aside).toHaveAttribute("aria-hidden", "true");

      fireEvent.click(toggle());
      expect(aside).not.toHaveAttribute("inert");
      expect(aside).not.toHaveAttribute("aria-hidden");
    } finally {
      Reflect.deleteProperty(window, "matchMedia");
    }
  });

  it("never locks the sidebar out on desktop, where it is always visible", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: true,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });

    try {
      renderShell();
      const aside = document.querySelector("aside");
      expect(aside).not.toHaveAttribute("inert");
      expect(aside).not.toHaveAttribute("aria-hidden");
    } finally {
      Reflect.deleteProperty(window, "matchMedia");
    }
  });
});

describe("C-1 content pane is allowed to shrink", () => {
  it("gives <main> min-w-0 so a wide child cannot widen the flex row", () => {
    renderShell();
    const main = document.querySelector("main");
    expect(main?.className).toContain("min-w-0");
    expect(main?.className).toContain("flex-1");
  });
});
