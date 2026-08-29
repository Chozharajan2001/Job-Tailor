import { describe, it, expect } from "vitest";
import { assertSafePublicUrl } from "../utils/url-guard.js";
import {
  escapeRegex,
  getSynonymRegexString,
  buildKeywordMatcher,
} from "../utils/skill-matcher.js";

/**
 * SSRF guard + shared matcher unit tests.
 * Only literal-IP / scheme cases are asserted here so the suite never
 * depends on network access or DNS resolution.
 */
describe("url-guard: assertSafePublicUrl", () => {
  it("rejects non-http(s) schemes", async () => {
    await expect(
      assertSafePublicUrl("ftp://example.com/file"),
    ).rejects.toThrowError(/not allowed/);
    await expect(
      assertSafePublicUrl("file:///etc/passwd"),
    ).rejects.toThrowError(/not allowed/);
    await expect(
      assertSafePublicUrl("javascript:alert(1)"),
    ).rejects.toThrowError(/not allowed/);
    await expect(
      assertSafePublicUrl("gopher://example.com"),
    ).rejects.toThrowError(/not allowed/);
  });

  it("rejects loopback and private literal IPs", async () => {
    await expect(
      assertSafePublicUrl("http://127.0.0.1:27017/admin"),
    ).rejects.toThrowError(/private|internal/);
    await expect(assertSafePublicUrl("http://10.0.0.5/")).rejects.toThrowError(
      /private|internal/,
    );
    await expect(
      assertSafePublicUrl("http://192.168.1.1/"),
    ).rejects.toThrowError(/private|internal/);
    await expect(
      assertSafePublicUrl("http://172.16.0.10/"),
    ).rejects.toThrowError(/private|internal/);
    await expect(
      assertSafePublicUrl("http://100.64.0.1/"),
    ).rejects.toThrowError(/private|internal/);
  });

  it("rejects cloud metadata / link-local endpoints", async () => {
    await expect(
      assertSafePublicUrl("http://169.254.169.254/latest/meta-data/"),
    ).rejects.toThrowError(/private|internal/);
    await expect(
      assertSafePublicUrl("http://metadata.google.internal/computeMetadata"),
    ).rejects.toThrowError(/blocked/);
  });

  it("rejects localhost and internal hostnames", async () => {
    await expect(
      assertSafePublicUrl("http://localhost:5173/"),
    ).rejects.toThrowError(/blocked/);
    await expect(
      assertSafePublicUrl("http://db.internal:5432/"),
    ).rejects.toThrowError(/blocked/);
    await expect(
      assertSafePublicUrl("http://printer.local/"),
    ).rejects.toThrowError(/blocked/);
  });

  it("rejects IPv6 loopback and IPv4-mapped loopback", async () => {
    await expect(assertSafePublicUrl("http://[::1]/")).rejects.toThrowError(
      /private|internal/,
    );
    await expect(
      assertSafePublicUrl("http://[::ffff:127.0.0.1]/"),
    ).rejects.toThrowError(/private|internal/);
  });

  it("accepts public literal IPs", async () => {
    const parsed = await assertSafePublicUrl("https://93.184.216.34/jobs/123");
    expect(parsed.hostname).toBe("93.184.216.34");
    expect(parsed.protocol).toBe("https:");
  });

  it("rejects invalid URLs", async () => {
    await expect(assertSafePublicUrl("not a url")).rejects.toThrowError(
      /Invalid URL/,
    );
  });
});

describe("skill-matcher", () => {
  it("escapeRegex neutralizes metacharacters (ReDoS / injection safe)", () => {
    const hostile = ".*+?^${}()|[]\\";
    const escaped = escapeRegex(hostile);
    // The escaped string matches only itself
    const regex = new RegExp(`^${escaped}$`);
    expect(regex.test(hostile)).toBe(true);
    expect(regex.test("anything else")).toBe(false);
  });

  it("user-supplied location strings never become wildcards", () => {
    const regex = new RegExp(escapeRegex(".*"), "i");
    expect(regex.test("Remote")).toBe(false); // ".*" must not match everything
  });

  it("builds synonym-aware keyword matchers", () => {
    expect(buildKeywordMatcher("react").test("We need React.js devs")).toBe(
      true,
    );
    expect(buildKeywordMatcher("react").test("reaction")).toBe(false);
    expect(buildKeywordMatcher("node").test("Node.js backend")).toBe(true);
  });

  it("getSynonymRegexString escapes unknown words", () => {
    const pattern = getSynonymRegexString("c++");
    expect(() => new RegExp(pattern)).not.toThrow();
    expect(new RegExp(pattern, "i").test("c++ expert")).toBe(true);
  });
});
