import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { greenhouseConnector } from "../services/source-connectors/greenhouse.js";
import { leverConnector } from "../services/source-connectors/lever.js";
import { ashbyConnector } from "../services/source-connectors/ashby.js";
import { remoteokConnector } from "../services/source-connectors/remoteok.js";

/**
 * Tests use vi.stubGlobal to intercept fetch — no external HTTP-mocking
 * library. Each test enqueues exactly one fetch mock implementation.
 */
type FetchImpl = (url: string, init?: unknown) => Promise<Response>;

function mockFetchOk(urlOrMatcher: string | RegExp, body: unknown) {
  const impl: FetchImpl = async (url) => {
    if (typeof urlOrMatcher === "string") {
      expect(url).toBe(urlOrMatcher);
    } else {
      expect(url).toMatch(urlOrMatcher);
    }
    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as unknown as Response;
  };
  (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(impl);
}

function mockFetchStatus(url: string, status: number) {
  (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
    async () =>
      ({
        ok: false,
        status,
      }) as unknown as Response,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("greenhouse connector", () => {
  it("enriches list results with per-job content via the detail endpoint (H3)", async () => {
    mockFetchOk("https://boards-api.greenhouse.io/v1/boards/acme/jobs", {
      jobs: [
        {
          id: 101,
          title: "Senior Engineer",
          absolute_url: "https://gh/acme/101",
          location: { name: "Remote" },
          updated_at: "2026-09-01T10:00:00Z",
          first_published: "2026-08-01T00:00:00Z",
          departments: [{ name: "Engineering" }],
        },
        {
          id: 102,
          title: "PM",
          absolute_url: "https://gh/acme/102",
          location: { name: "NYC" },
        },
      ],
    });
    // The list endpoint omits `content` — fetchJobs must pull each job's
    // detail or the ingest fails CanonicalJob's required description.
    mockFetchOk("https://boards-api.greenhouse.io/v1/boards/acme/jobs/101", {
      id: 101,
      title: "Senior Engineer",
      absolute_url: "https://gh/acme/101",
      content: "<p>Deep React work.</p>",
    });
    mockFetchOk("https://boards-api.greenhouse.io/v1/boards/acme/jobs/102", {
      id: 102,
      title: "PM",
      absolute_url: "https://gh/acme/102",
      content: "<p>Roadmaps.</p>",
    });

    const jobs = await greenhouseConnector.fetchJobs("acme");
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      externalId: "101",
      title: "Senior Engineer",
      url: "https://gh/acme/101",
      companyName: "acme",
      locationText: "Remote",
      department: "Engineering",
      descriptionHtml: "<p>Deep React work.</p>",
    });
    // toCanonicalJob yields a non-empty description — the bug this fixes
    // produced jdRawText "" which fails CanonicalJob.description required.
    expect(
      greenhouseConnector.toCanonicalJob(jobs[1]).jdRawText.trim().length,
    ).toBeGreaterThan(0);
  });

  it("skips jobs whose detail fetch fails instead of yielding empty-content jobs", async () => {
    mockFetchOk("https://boards-api.greenhouse.io/v1/boards/acme/jobs", {
      jobs: [
        { id: 101, title: "A", absolute_url: "https://gh/acme/101" },
        { id: 102, title: "B", absolute_url: "https://gh/acme/102" },
      ],
    });
    mockFetchOk("https://boards-api.greenhouse.io/v1/boards/acme/jobs/101", {
      id: 101,
      title: "A",
      absolute_url: "https://gh/acme/101",
      content: "<p>ok</p>",
    });
    mockFetchStatus(
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs/102",
      500,
    );

    const jobs = await greenhouseConnector.fetchJobs("acme");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].externalId).toBe("101");
  });

  it("returns empty array when no jobs", async () => {
    mockFetchOk("https://boards-api.greenhouse.io/v1/boards/acme/jobs", {
      jobs: [],
    });
    expect(await greenhouseConnector.fetchJobs("acme")).toEqual([]);
  });

  it("throws on HTTP error", async () => {
    mockFetchStatus("https://boards-api.greenhouse.io/v1/boards/bad/jobs", 404);
    await expect(greenhouseConnector.fetchJobs("bad")).rejects.toThrow(/404/);
  });

  it("strips HTML to plain text in toCanonicalJob", () => {
    const input = greenhouseConnector.toCanonicalJob(
      {
        externalId: "1",
        url: "https://gh/acme/1",
        title: "T",
        companyName: "acme",
        descriptionHtml:
          "<p>Build <strong>things</strong> &amp; ship.</p><p>Line two.</p>",
      },
      "Acme",
    );
    expect(input.jdRawText).toBe("Build things & ship.\n\nLine two.");
    expect(input.companyName).toBe("Acme");
  });
});

describe("lever connector", () => {
  it("maps Lever postings to RawJob", async () => {
    mockFetchOk("https://api.lever.co/v0/postings/acme?mode=json", [
      {
        id: "L1",
        text: "Engineer",
        hostedUrl: "https://jobs.lever.co/acme/L1",
        categories: {
          location: "Berlin",
          team: "Platform",
          commitment: "Full-time",
        },
        createdAt: 1726000000000,
      },
    ]);

    const jobs = await leverConnector.fetchJobs("acme");
    expect(jobs[0]).toMatchObject({
      externalId: "L1",
      title: "Engineer",
      url: "https://jobs.lever.co/acme/L1",
      companyName: "acme",
      locationText: "Berlin",
      team: "Platform",
      employmentType: "Full-time",
    });
    expect(jobs[0].publishedAt).toBeInstanceOf(Date);
  });

  it("throws on HTTP error", async () => {
    mockFetchStatus("https://api.lever.co/v0/postings/bad?mode=json", 500);
    await expect(leverConnector.fetchJobs("bad")).rejects.toThrow(/500/);
  });

  it("converts a RawJob to CanonicalJobInput", () => {
    const input = leverConnector.toCanonicalJob(
      {
        externalId: "L1",
        url: "https://jobs.lever.co/acme/L1",
        title: "Engineer",
        companyName: "acme",
        locationText: "Berlin",
        descriptionHtml: "<p>do work</p>",
        employmentType: "Full-time",
      },
      "Acme",
    );
    expect(input).toMatchObject({
      title: "Engineer",
      companyName: "Acme",
      location: "Berlin",
      jdRawText: "do work",
      employmentType: "Full-time",
    });
  });
});

describe("ashby connector", () => {
  it("fetches listed jobs and skips unlisted", async () => {
    mockFetchOk(
      "https://api.ashbyhq.com/posting-api/job-board/acme?includeCompensation=true",
      {
        jobs: [
          {
            id: "A1",
            title: "SWE",
            location: "SF",
            department: "Eng",
            team: "API",
            jobUrl: "https://ashby/jobs/A1",
            descriptionHtml: "<p>hi</p>",
            publishedAt: "2026-09-01T00:00:00Z",
            isListed: true,
            employmentType: "FULL_TIME",
          },
          {
            id: "A2",
            title: "Hidden",
            isListed: false,
            jobUrl: "",
            location: "",
          },
        ],
      },
    );
    const jobs = await ashbyConnector.fetchJobs("acme");
    expect(jobs.map((j) => j.externalId)).toEqual(["A1"]);
  });

  it("converts a RawJob to CanonicalJobInput", () => {
    const input = ashbyConnector.toCanonicalJob({
      externalId: "A1",
      url: "https://ashby/jobs/A1",
      title: "SWE",
      companyName: "acme",
      descriptionHtml: "<p>do it</p>",
    });
    expect(input.jdRawText).toBe("do it");
  });

  it("throws on HTTP error", async () => {
    mockFetchStatus(
      "https://api.ashbyhq.com/posting-api/job-board/bad?includeCompensation=true",
      403,
    );
    await expect(ashbyConnector.fetchJobs("bad")).rejects.toThrow(/403/);
  });
});

describe("remoteok connector", () => {
  it("parses valid entries and skips malformed ones", async () => {
    mockFetchOk("https://remoteok.com/api", [
      {
        position: "Dev",
        company: "Acme",
        location: "Remote",
        url: "https://remoteok.com/l/1",
        description: "<p>hi</p>",
        published_at: "2026-09-01T00:00:00Z",
        tags: ["full-time"],
      },
      {
        position: "Designer",
        company: "Beta",
        location: "EU",
        url: "https://remoteok.com/l/2",
      },
      {},
    ]);
    const jobs = await remoteokConnector.fetchJobs("_");
    expect(jobs).toHaveLength(2);
    expect(jobs[0].externalId).toBe("https://remoteok.com/l/1");
  });

  it("finds the employment type in any tag, not tags[0]", async () => {
    // Live feed (2026-09-30, 99 rows): tags[0] is a role/category tag
    // ("golang", "design", "exec"), so reading only tags[0] mislabels or
    // drops every posting.
    mockFetchOk("https://remoteok.com/api", [
      {
        position: "Backend Engineer",
        company: "Acme",
        location: "Remote",
        url: "https://remoteok.com/l/11",
        tags: ["golang", "senior", "part time"],
      },
      {
        position: "Product Designer",
        company: "Beta",
        location: "EU",
        url: "https://remoteok.com/l/12",
        tags: ["design", "mid"],
      },
    ]);

    const jobs = await remoteokConnector.fetchJobs("_");
    expect(jobs[0].employmentType).toBe("part time");
    expect(jobs[1].employmentType).toBeUndefined();
  });

  it("throws on HTTP error", async () => {
    mockFetchStatus("https://remoteok.com/api", 502);
    await expect(remoteokConnector.fetchJobs("_")).rejects.toThrow(/502/);
  });
});
