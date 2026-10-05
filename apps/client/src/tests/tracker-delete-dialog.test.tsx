import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * C-2 (step 3 of the CTA call): the tracker's destructive action ran through
 * window.confirm, which no screen reader announces as part of the app, cannot
 * be styled, and gives a keyboard user a browser-chrome dialog outside the
 * React tree. It also deleted the row the instant the browser returned true.
 *
 * The app already ships ConfirmDialog (Radix AlertDialog) with the Escape and
 * focus-trap behaviour that jsdom cannot fake on a native confirm, so the fix
 * is to route the delete through it — no new dependency, no JobsPage churn.
 */

const seededApplication = {
  _id: "a1",
  status: "applied",
  appliedDate: "2026-09-02T10:00:00.000Z",
  createdAt: "2026-09-02T10:00:00.000Z",
  jobId: {
    _id: "j1",
    jobTitle: "Senior Backend Engineer",
    companyName: "Stripe",
    location: "Remote",
    workType: "remote",
    jobLink: "https://example.com/j1",
  },
  resumeId: null,
  timeline: [],
  reminders: [],
  notes: [],
};

const genericResponse = {
  data: {
    applications: [seededApplication],
    application: seededApplication,
    jobs: [],
    job: null,
    resumes: [],
    resume: null,
    profile: null,
    watches: [],
    savedSearches: [],
    alerts: [],
    sources: [],
    feed: [],
    analytics: {},
    overview: {},
    timeline: [],
    reminders: [],
    notes: [],
  },
};

const apiMock = {
  get: vi.fn(() => Promise.resolve(genericResponse)),
  post: vi.fn(() => Promise.resolve(genericResponse)),
  put: vi.fn(() => Promise.resolve(genericResponse)),
  patch: vi.fn(() => Promise.resolve(genericResponse)),
  delete: vi.fn(() => Promise.resolve(genericResponse)),
};

vi.mock("../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/api")>();
  return { ...actual, api: apiMock };
});

const { default: TrackerPage } = await import("../pages/TrackerPage.js");

function renderTracker() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TrackerPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openDetailWithDelete() {
  renderTracker();
  await waitFor(() =>
    expect(screen.getByText("Senior Backend Engineer")).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByText("Senior Backend Engineer"));
  return screen.getByRole("button", { name: /delete application/i });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("C-2 tracker delete confirmation", () => {
  it("asks inside the app instead of with a native confirm dialog", async () => {
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockImplementation(() => true);

    const deleteButton = await openDetailWithDelete();
    fireEvent.click(deleteButton);

    expect(confirmSpy).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName(/delete/i);
    expect(dialog).toHaveAttribute("aria-modal", "true");

    confirmSpy.mockRestore();
  });

  it("does not delete until the confirmation is accepted", async () => {
    const deleteButton = await openDetailWithDelete();
    fireEvent.click(deleteButton);

    await screen.findByRole("dialog");
    expect(apiMock.delete).not.toHaveBeenCalled();

    fireEvent.click(
      withinDialogConfirmButton(await screen.findByRole("dialog")),
    );

    await waitFor(() =>
      expect(apiMock.delete).toHaveBeenCalledWith("/applications/a1"),
    );
  });

  it("keeps the application when the confirmation is cancelled", async () => {
    const deleteButton = await openDetailWithDelete();
    fireEvent.click(deleteButton);

    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(apiMock.delete).not.toHaveBeenCalled();
  });
});

/** Radix renders the confirm action as the alertdialog's action button. */
function withinDialogConfirmButton(dialog: HTMLElement): HTMLElement {
  const buttons = Array.from(
    dialog.querySelectorAll<HTMLButtonElement>("button"),
  );
  const confirm = buttons.find((b) => /delete/i.test(b.textContent || ""));
  if (!confirm) throw new Error("no confirm button inside the dialog");
  return confirm;
}
