import { describe, it, expect } from "vitest";
import { greenhouseDetector } from "../src/detectors/greenhouse.js";
import { greenhouseExtractor } from "../src/extractors/greenhouse.js";
import { leverDetector } from "../src/detectors/lever.js";
import { leverExtractor } from "../src/extractors/lever.js";
import { ashbyDetector } from "../src/detectors/ashby.js";
import { ashbyExtractor } from "../src/extractors/ashby.js";
import { workdayDetector } from "../src/detectors/workday.js";
import { workdayExtractor } from "../src/extractors/workday.js";
import { htmlToText, humanizeSlug } from "../src/utils/text.js";

/**
 * Synthetic fixtures: minimal stand-ins for each ATS's confirmation and job
 * pages, built to the selectors the detectors/extractors rely on. These are
 * deliberately NOT copies of live pages — they pin OUR assumptions. If a
 * platform changes its DOM, the live-page smoke (manual) catches it; these
 * tests catch logic regressions.
 */

function docWith(bodyHtml: string, title = ""): Document {
  document.title = title;
  document.body.innerHTML = bodyHtml;
  return document;
}

describe("htmlToText / humanizeSlug", () => {
  it("strips tags, decodes entities, keeps paragraph breaks", () => {
    expect(htmlToText("<p>One</p><p>Two &amp; three</p>")).toBe(
      "One\n\nTwo & three",
    );
    expect(htmlToText("a<br/>b")).toBe("a\nb");
    expect(htmlToText("")).toBe("");
  });
  it("humanizes slugs", () => {
    expect(humanizeSlug("stripe")).toBe("Stripe");
    expect(humanizeSlug("acme-tools")).toBe("Acme Tools");
  });
});

describe("greenhouse", () => {
  it("detects via thank-you URL", () => {
    expect(
      greenhouseDetector.isApplicationSubmitted({
        url: "https://boards.greenhouse.io/acme/jobs/1/thank-you",
        document: docWith("<p>whatever</p>", "Acme"),
      }),
    ).toBe(true);
  });
  it("detects via body message", () => {
    expect(
      greenhouseDetector.isApplicationSubmitted({
        url: "https://boards.greenhouse.io/acme/jobs/1/application/thank_you",
        document: docWith("<div>Thanks for applying!</div>"),
      }),
    ).toBe(true);
  });
  it("does not fire on the job page itself", () => {
    expect(
      greenhouseDetector.isApplicationSubmitted({
        url: "https://boards.greenhouse.io/acme/jobs/1",
        document: docWith("<div id='app'>Senior Engineer. Apply now.</div>"),
      }),
    ).toBe(false);
  });
  it("extracts role @ company from og:title and body from #app", () => {
    const d = docWith(
      `<meta property="og:title" content="Senior Engineer @ Acme">
       <div id="app"><p>Build things.</p></div>`,
    );
    const draft = greenhouseExtractor.extract({
      document: d,
      url: "https://boards.greenhouse.io/acme/jobs/123",
    });
    expect(draft).toMatchObject({
      platform: "greenhouse",
      jobTitle: "Senior Engineer",
      companyName: "Acme",
      jdRawText: "Build things.",
    });
    expect(draft.sourceUrl).toContain("/jobs/123");
  });
  it("falls back to path slug for company when og:title has no @", () => {
    const d = docWith(`<div id="app">Body</div>`);
    d.head.querySelector("meta")?.remove();
    const draft = greenhouseExtractor.extract({
      document: d,
      url: "https://boards.greenhouse.io/datadog/jobs/42",
    });
    expect(draft.companyName).toBe("Datadog");
  });
});

describe("lever", () => {
  it("detects via thank-you URL", () => {
    expect(
      leverDetector.isApplicationSubmitted({
        url: "https://jobs.lever.co/acme/uuid/thank-you",
        document: docWith("<p>done</p>"),
      }),
    ).toBe(true);
  });
  it("extracts title from .posting-name and JD from .contents", () => {
    const d = docWith(
      `<div class="posting-name">Staff Engineer</div>
       <div class="contents"><p>Scale things.</p></div>`,
    );
    const draft = leverExtractor.extract({
      document: d,
      url: "https://jobs.lever.co/acme/uuid",
    });
    expect(draft).toMatchObject({
      platform: "lever",
      jobTitle: "Staff Engineer",
      companyName: "Acme",
      jdRawText: "Scale things.",
    });
  });
});

describe("ashby", () => {
  it("detects via applications/success URL", () => {
    expect(
      ashbyDetector.isApplicationSubmitted({
        url: "https://jobs.ashbyhq.com/acme/uuid/applications/success/abc",
        document: docWith("<p>done</p>"),
      }),
    ).toBe(true);
  });
  it("extracts from __ASBY__DATA script blob", () => {
    const data = {
      job: {
        name: "Product Designer",
        organizationName: "Linear",
        descriptionHtml: "<p>Design things.</p>",
      },
    };
    const d = docWith(
      `<script>window.__ASBY__DATA = ${JSON.stringify(data)};</script>`,
    );
    const draft = ashbyExtractor.extract({
      document: d,
      url: "https://jobs.ashbyhq.com/linear/uuid",
    });
    expect(draft).toMatchObject({
      platform: "ashby",
      jobTitle: "Product Designer",
      companyName: "Linear",
      jdRawText: "Design things.",
    });
  });
  it("falls back to DOM when blob is missing", () => {
    const d = docWith("<h2>Backend Engineer</h2><main><p>API work</p></main>");
    const draft = ashbyExtractor.extract({
      document: d,
      url: "https://jobs.ashbyhq.com/vercel/uuid",
    });
    expect(draft.jobTitle).toBe("Backend Engineer");
    expect(draft.jdRawText).toContain("API work");
  });
  it("is not script-injectable via the blob (no execution, text read only)", () => {
    const d = docWith(
      `<script>window.__ASBY__DATA = { job: { name: "X", descriptionHtml: "<img src=x onerror=alert(1)>" } };</script>`,
    );
    const draft = ashbyExtractor.extract({
      document: d,
      url: "https://jobs.ashbyhq.com/acme/uuid",
    });
    // Text-only strip: the img tag must survive as nothing, not as markup,
    // and must never be attached to the live DOM.
    expect(draft.jdRawText).toBe("");
    expect(d.querySelector("img")).toBeNull();
  });
});

describe("workday", () => {
  it("detects via title", () => {
    expect(
      workdayDetector.isApplicationSubmitted({
        url: "https://acme.wd1.myworkdayjobs.com/en-US/Ext/job/x/JR-1/apply",
        document: docWith("<p>ok</p>", "Application Complete"),
      }),
    ).toBe(true);
  });
  it("detects via body text variants", () => {
    expect(
      workdayDetector.isApplicationSubmitted({
        url: "https://acme.wd1.myworkdayjobs.com/x",
        document: docWith("<div>Thank you for your application</div>"),
      }),
    ).toBe(true);
  });
  it("extracts title, tenant company, and JD section", () => {
    const d = docWith(
      `<p class="job-title">Data Engineer</p>
       <section aria-label="Job Description"><p>Pipelines.</p></section>`,
    );
    const draft = workdayExtractor.extract({
      document: d,
      url: "https://acme-gmbh.wd1.myworkdayjobs.com/en-US/Ext/job/Data-Engineer_JR-9",
    });
    expect(draft).toMatchObject({
      platform: "workday",
      jobTitle: "Data Engineer",
      companyName: "Acme Gmbh",
      jdRawText: "Pipelines.",
    });
  });
});
