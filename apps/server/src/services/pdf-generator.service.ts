/**
 * PDF Generator Service — Converts tailored resume HTML to PDF using Puppeteer.
 *
 * Flow:
 * 1. Takes tailored resume data (from Resume model)
 * 2. Renders it into a clean HTML template (all fields HTML-escaped)
 * 3. Uses a shared Puppeteer browser (singleton) to generate the PDF buffer
 * 4. Uploads to Cloudinary (or returns base64 for local dev)
 * 5. Returns download URL
 */

import type { Browser } from "puppeteer";
import type { IResume } from "../models/Resume.model.js";
import { config } from "../config/index.js";
import { v2 as cloudinary } from "cloudinary";
import { escapeHtml } from "../utils/escape-html.js";

// ─── Template Generation ───────────────────────────────────────

function buildResumeHTML(resume: IResume): string {
  const skills = (resume.skills || [])
    .map(
      (s) =>
        `<span class="skill">${escapeHtml((s as unknown as { name: string }).name)}</span>`,
    )
    .join("");

  const experienceHTML = (resume.experience || [])
    .map((exp: Record<string, unknown>) => {
      const e = exp as {
        company?: string;
        role?: string;
        startDate?: string;
        endDate?: string | null;
        location?: string;
        bullets?: Array<{ text: string }>;
      };
      return `
        <div class="section-block">
          <div class="block-header">
            <h3>${escapeHtml(e.role || "")}</h3>
            <span class="meta">${escapeHtml(e.company || "")} · ${escapeHtml(e.startDate || "")}${e.endDate ? ` – ${escapeHtml(e.endDate)}` : " – Present"}</span>
          </div>
          ${e.location ? `<p class="location">${escapeHtml(e.location)}</p>` : ""}
          <ul class="bullets">
            ${(e.bullets || []).map((b) => `<li>${escapeHtml(b.text)}</li>`).join("")}
          </ul>
        </div>`;
    })
    .join("");

  const projectsHTML = (resume.projects || [])
    .map((proj: Record<string, unknown>) => {
      const p = proj as {
        name?: string;
        description?: string;
        techStack?: string[];
        highlights?: string[];
      };
      const techStack = p.techStack || [];
      return `
        <div class="project-item">
          <h3>${escapeHtml(p.name || "")}</h3>
          <p class="project-desc">${escapeHtml(p.description || "")}</p>
          ${techStack.length > 0 ? `<p class="tech-stack">${techStack.map((t) => escapeHtml(t)).join(" · ")}</p>` : ""}
        </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(resume.versionLabel || "Resume")}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #1a1a2e;
    background: #fff;
    max-width: 8.5in;
    margin: 0 auto;
    padding: 0.6in 0.75in;
  }
  h1 { font-size: 20pt; color: #2563eb; margin-bottom: 2pt; letter-spacing: -0.5pt; }
  h2 { font-size: 13pt; text-transform: uppercase; letter-spacing: 1.5pt; 
       color: #374151; border-bottom: 2px solid #2563eb; padding-bottom: 4px; margin-top: 16pt; margin-bottom: 10pt; }
  h3 { font-size: 12pt; color: #111827; margin-bottom: 3pt; }
  .summary { font-size: 10.5pt; color: #4b5563; line-height: 1.55; margin-bottom: 14pt; }
  .skills-container { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
  .skill { display: inline-block; padding: 3px 9px; font-size: 9.5pt; background: #eff6ff; color: #1d4ed8;
         border-radius: 999px; border: 1px solid #bfdbfe; font-weight: 500; }
  .section-block { margin-bottom: 12pt; page-break-inside: avoid; }
  .block-header { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 4px; }
  .meta { font-size: 9.5pt; color: #6b7280; }
  .location { font-size: 9pt; color: #9ca3af; margin-top: 1pt; }
  .bullets { list-style: none; padding-left: 0; margin-top: 5pt; }
  .bullets li { position: relative; padding-left: 14px; margin-bottom: 3pt; font-size: 10.5pt; line-height: 1.45; }
  .bullets li::before { content: '▸'; position: absolute; left: 0; color: #2563eb; font-weight: bold; }
  .project-item { margin-bottom: 10pt; page-break-inside: avoid; }
  .project-item h3 { font-size: 11pt; }
  .project-desc { font-size: 10pt; color: #4b5563; margin: 2pt 0; }
  .tech-stack { font-size: 9pt; color: #6b7280; }
  .score-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 99px; 
                font-size: 8.5pt; font-weight: 700; margin-top: 4px; }
  .ats-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8pt; padding-bottom: 6pt;
                  border-bottom: 1px dashed #d1d5db; }
</style>
</head>
<body>

<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6pt;">
  <h1>JobTailor Resume</h1>
  <span style="font-size:8.5pt;color:#9ca3af;">Generated: ${new Date().toLocaleDateString()}</span>
</div>

${resume.tailoredSummary ? `<p class="summary">${escapeHtml(resume.tailoredSummary)}</p>` : ""}

<!-- ATS Score -->
${
  resume.atsScore
    ? `
<div class="ats-header">
  <h2>ATS Match Score</h2>
  <span class="score-badge" style="background:${resume.atsScore.overallScore >= 80 ? "#dcfce7;color:#166534;border:1px solid #bbf7d0" : resume.atsScore.overallScore >= 60 ? "#fef9c3;color:#854d0e;border:1px solid #fde68a" : "#fee2e2;color:#991b1b;border:1px solid #fecaca"}">
    ${Number(resume.atsScore.overallScore) || 0}/100
  </span>
</div>
<ul style="list-style:none;padding:0;display:flex;gap:16pt;font-size:9pt;color:#6b7280;margin-bottom:12pt;">
  <li>Keywords: ${Number(resume.atsScore.keywordMatchScore) || 0}%</li>
  <li>Semantic: ${Number(resume.atsScore.semanticMatchScore) || 0}%</li>
  <li>Format: ${Number(resume.atsScore.formatScore) || 0}%</li>
</ul>
`
    : ""
}

<h2>Skills</h2>
<div class="skills-container">${skills}</div>

${experienceHTML ? "<h2>Experience</h2>" + experienceHTML : ""}

${projectsHTML ? "<h2>Projects</h2>" + projectsHTML : ""}

</body>
</html>`;
}

// ─── Shared Browser ──────────────────────────────────────────

let browserPromise: Promise<Browser> | null = null;

/**
 * Lazily launch (and cache) a single Chromium instance for the process.
 * Relaunches automatically if the previous instance disconnected.
 */
async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    if (existing && existing.connected) return existing;
    browserPromise = null;
  }

  const puppeteer = await import("puppeteer");
  browserPromise = puppeteer.default.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
  return browserPromise;
}

/**
 * Graceful shutdown hook — call on SIGTERM/SIGINT.
 */
export async function closePdfBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  browserPromise = null;
  if (browser) await browser.close().catch(() => {});
}

// ─── PDF Generation ──────────────────────────────────────────

export async function generatePDF(
  resume: IResume,
): Promise<{ pdfUrl: string; pdfBuffer?: Buffer }> {
  // Build HTML from resume data (all user content escaped)
  const html = buildResumeHTML(resume);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: "load" });

    const pdfBuffer = Buffer.from(
      await page.pdf({
        format: "A4",
        printBackground: true,
        margin: {
          top: "0.5in",
          bottom: "0.5in",
          left: "0.65in",
          right: "0.65in",
        },
        preferCSSPageSize: false,
        displayHeaderFooter: false,
      }),
    );

    // If Cloudinary is configured, upload
    if (config.cloudinary.cloudName && config.cloudinary.apiKey) {
      const cloudinaryUrl = await uploadToCloudinary(
        pdfBuffer,
        resume.versionLabel,
      );
      return { pdfUrl: cloudinaryUrl, pdfBuffer };
    }

    // Fallback: return as data URL for direct download
    const dataUrl = `data:application/pdf;base64,${pdfBuffer.toString("base64")}`;
    return { pdfUrl: dataUrl, pdfBuffer };
  } finally {
    // Always release the page so the shared browser never leaks tabs
    await page.close().catch(() => {});
  }
}

// ─── Cloudinary Upload ───────────────────────────────────────

export async function uploadToCloudinary(
  buffer: Buffer,
  publicId: string,
): Promise<string> {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
  });

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: config.cloudinary.folder,
        resource_type: "raw",
        public_id: `${publicId}_${Date.now()}`,
        format: "pdf",
        type: "upload",
      },
      (
        error: Error | undefined,
        result: { secure_url: string } | undefined,
      ) => {
        if (error) reject(error);
        else if (result) resolve(result.secure_url);
        else reject(new Error("Cloudinary upload returned no result"));
      },
    );

    uploadStream.end(buffer);
  });
}
