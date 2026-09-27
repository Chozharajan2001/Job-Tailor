import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the MV3 manifest: Chrome refuses to load on the smallest schema
 * mistake, and the ATS match patterns are easy to typo. Cheap to check here
 * so a broken manifest never reaches "Load unpacked".
 */
describe("manifest.json", () => {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), "manifest.json"), "utf8"),
  );

  it("is manifest version 3 with required fields", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBeTruthy();
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("declares the service worker, popup, and options page", () => {
    expect(manifest.background.service_worker).toBe("background.js");
    expect(manifest.action.default_popup).toBe("popup.html");
    expect(manifest.options_page).toBe("options.html");
  });

  it("injects content.js on all four supported ATS domains", () => {
    const matches: string[] = manifest.content_scripts[0].matches;
    expect(matches.some((m) => m.includes("greenhouse.io"))).toBe(true);
    expect(matches.some((m) => m.includes("lever.co"))).toBe(true);
    expect(matches.some((m) => m.includes("ashbyhq.com"))).toBe(true);
    expect(matches.some((m) => m.includes("myworkdayjobs.com"))).toBe(true);
  });

  it("keeps permissions minimal (storage only, no broad host access)", () => {
    expect(manifest.permissions).toEqual(["storage"]);
    expect(manifest.host_permissions).toContain("http://localhost:5000/*");
  });
});
