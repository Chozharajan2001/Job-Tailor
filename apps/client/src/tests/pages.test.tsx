import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the api layer but keep the module's other exports (ApiError, types)
// so transitively imported code keeps working.
const seededJob = {
  _id: "j1",
  jobTitle: "Seeded Backend Role",
  companyName: "Seed Corp",
  location: "Remote",
  workType: "remote",
  status: "active",
  isActive: true,
  sourceName: "test",
  createdAt: "2026-09-01T10:00:00.000Z",
  lastSeenAt: "2026-09-01T10:00:00.000Z",
};

const seededApplication = {
  _id: "a1",
  status: "applied",
  appliedDate: "2026-09-02T10:00:00.000Z",
  createdAt: "2026-09-02T10:00:00.000Z",
  jobId: seededJob,
  resumeId: null,
  timeline: [],
  reminders: [],
  notes: [],
};

const seededProfile = {
  _id: "p1",
  summary: "Seeded summary for page gate tests.",
  skills: [
    {
      _id: "s1",
      name: "Seeded Skill",
      category: "frontend",
      yearsOfExperience: 3,
      proficiency: "advanced",
    },
  ],
  experience: [],
  projects: [],
  education: [],
  certifications: [],
};

// One generic envelope: every page reads res?.data?.<key> with a || [] / {} fallback.
const genericResponse = {
  data: {
    jobs: [seededJob],
    job: seededJob,
    applications: [seededApplication],
    resumes: [],
    profile: seededProfile,
    watches: [],
    savedSearches: [],
    alerts: [],
    sources: [],
    feed: [],
    analytics: {},
    overview: {},
  },
};

vi.mock("../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/api")>();
  const ok = () => Promise.resolve(genericResponse);
  return {
    ...actual,
    api: {
      get: vi.fn(ok),
      post: vi.fn(ok),
      put: vi.fn(ok),
      patch: vi.fn(ok),
      delete: vi.fn(ok),
    },
  };
});

// Imported AFTER the mock so pages bind the stubbed api.
import JobsPage from "../pages/JobsPage";
import ProfilePage from "../pages/ProfilePage";
import TrackerPage from "../pages/TrackerPage";

function renderPage(Page: React.ComponentType) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("High-churn page gates (render + one interaction)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("JobsPage renders seeded jobs and switches to the global search tab", async () => {
    renderPage(JobsPage);
    // Render gate: seeded data flows through the query layer into a job card.
    expect(await screen.findByText("Seeded Backend Role")).toBeInTheDocument();

    // Interaction gate: the Global Job Search tab reveals its sub-tabs.
    fireEvent.click(screen.getByRole("button", { name: /Global Job Search/i }));
    expect(await screen.findByText(/Curated Feed/i)).toBeInTheDocument();
  });

  it("ProfilePage renders seeded skills and toggles the add-skill form", async () => {
    renderPage(ProfilePage);
    expect(await screen.findByText("Seeded Skill")).toBeInTheDocument();

    // Interaction gate: opening the form flips the toggle label.
    fireEvent.click(screen.getByRole("button", { name: /Add Skill/i }));
    expect(await screen.findByText("Close Form")).toBeInTheDocument();
  });

  it("TrackerPage renders the kanban from seeded applications and opens the create modal", async () => {
    renderPage(TrackerPage);
    expect(await screen.findByText("Seed Corp")).toBeInTheDocument();

    // Interaction gate: Create Application button opens the modal (h2 heading).
    fireEvent.click(
      screen.getByRole("button", { name: /Create Application/i }),
    );
    expect(
      await screen.findByRole("heading", { name: "Create Application" }),
    ).toBeInTheDocument();
  });
});
