import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import http from "node:http";
import { marked } from "marked";
import HTMLtoDOCX from "html-to-docx";
import puppeteer from "puppeteer-core";

const buildDir = dirname(fileURLToPath(import.meta.url));
const root = join(buildDir, "..");

// Optional CLI args: node build.mjs [inputMd] [outputDocx] [docTitle] [headerText]
const inputMd = process.argv[2] || join(root, "docs", "system-design.md");
const outputDocx =
  process.argv[3] || join(root, "docs", "JobTailor-System-Design-Document-v1.0.docx");
const docTitle = process.argv[4] || "System Design Document \u2014 JobTailor";
const headerText =
  process.argv[5] || "JobTailor \u2014 System Design Document \u00b7 v1.0 \u00b7 Draft";

const md = readFileSync(inputMd, "utf8");

// ── Extract mermaid blocks, replace with placeholders ───────────────
const diagrams = [];
const mdNoMermaid = md.replace(/```mermaid\r?\n([\s\S]*?)```/g, (_, code) => {
  diagrams.push(code.trim());
  return `MERMAID_DIAGRAM_${diagrams.length - 1}_PLACEHOLDER`;
});

// ── Render each diagram to PNG with headless Chrome + mermaid ESM ───
// The mermaid ESM bundle (with its chunk imports) is served from a loopback
// HTTP server — importing multi-MB modules over CDP as data: URLs exceeds
// protocol timeouts, and the UMD .min.js build has no ESM default export.
// Rendered PNGs are served from the same server because html-to-docx
// downloads http(s) src URLs but mishandles inline data: URIs.
const DIST_DIR = join(buildDir, "node_modules", "mermaid", "dist");
const assets = new Map(); // name -> Buffer (rendered PNGs)

async function startAssetServer() {
  const server = http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      if (urlPath.startsWith("/assets/")) {
        const png = assets.get(urlPath.slice("/assets/".length));
        if (!png) {
          res.writeHead(404);
          return res.end();
        }
        res.writeHead(200, { "Content-Type": "image/png" });
        return res.end(png);
      }
      const file = join(DIST_DIR, urlPath);
      if (!file.startsWith(DIST_DIR)) {
        res.writeHead(403);
        return res.end();
      }
      const body = readFileSync(file);
      const type = file.endsWith(".mjs") || file.endsWith(".js") ? "text/javascript" : "application/octet-stream";
      res.writeHead(200, { "Content-Type": type, "Access-Control-Allow-Origin": "*" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

async function renderDiagrams(codes, server) {
  if (codes.length === 0) return [];
  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    join(
      homedir(),
      ".cache", "puppeteer", "chrome", "win64-152.0.7977.54", "chrome-win64", "chrome.exe"
    );
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    protocolTimeout: 600_000,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 2 });
    const urls = [];
    for (let i = 0; i < codes.length; i++) {
      await page.setContent(
        `<!doctype html><html><head><style>
           body { margin: 0; background: #ffffff; }
           #stage { display: inline-block; padding: 12px; }
         </style></head><body><div id="stage"></div></body></html>`,
        { waitUntil: "load" }
      );
      const svg = await page.evaluate(async (url, code, id) => {
        const { default: mermaid } = await import(url);
        mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose" });
        const out = await mermaid.render(id, code);
        return out.svg;
      }, `${server.base}/mermaid.esm.min.mjs`, codes[i], "mmd" + i);
      await page.evaluate((s) => {
        const stage = document.getElementById("stage");
        const svgNode = new DOMParser().parseFromString(s, "image/svg+xml").documentElement;
        stage.replaceChildren(svgNode);
      }, svg);
      const el = await page.$("#stage");
      if (!el) throw new Error(`Diagram ${i + 1} produced no renderable element`);
      const name = `diagram-${i}.png`;
      assets.set(name, await el.screenshot({ type: "png" }));
      urls.push(`${server.base}/assets/${name}`);
      console.log(`  rendered diagram ${i + 1}/${codes.length}`);
    }
    return urls;
  } finally {
    await browser.close();
  }
}

const server = await startAssetServer();
let buffer;
try {
  console.log(`Rendering ${diagrams.length} mermaid diagram(s)...`);
  const imageUrls = await renderDiagrams(diagrams, server);

  // ── Markdown → HTML, then swap placeholders for diagram images ────
  let bodyHtml = await marked.parse(mdNoMermaid);
  imageUrls.forEach((url, i) => {
    const img = `<img src="${url}" width="600" alt="Diagram ${i + 1}"/>`;
    bodyHtml = bodyHtml
      .replace(`<p>MERMAID_DIAGRAM_${i}_PLACEHOLDER</p>`, img)
      .replace(`MERMAID_DIAGRAM_${i}_PLACEHOLDER`, img);
  });

const headerHtml =
  `<p style="text-align: right; font-size: 9pt; color: #555555;">${headerText}</p>`;

const documentOptions = {
  title: docTitle,
  subject: "System design of the JobTailor job application workspace",
  creator: "JobTailor project owner",
  description:
    "Architecture, data model, API design, security, and operational design of JobTailor, verified against the codebase on 2026-08-30.",
  keywords: ["JobTailor", "system design", "architecture"],
  font: "Calibri",
  fontSize: 22, // half-points → 11pt
  margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
  table: { row: { cantSplit: true } },
  header: true,
  footer: true,
  pageNumber: true,
  skipFirstHeaderFooter: false,
};

  buffer = await HTMLtoDOCX(bodyHtml, headerHtml, documentOptions, "<p></p>");
} finally {
  await server.close();
}

writeFileSync(outputDocx, buffer);
console.log(`Written: ${outputDocx} (${(buffer.length / 1024).toFixed(1)} KB)`);
