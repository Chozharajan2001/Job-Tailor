import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey } from "../utils/api-key.js";

process.env.NODE_ENV = "test";

describe("api-key utils", () => {
  it("produces a raw with a stable jtk_ prefix", () => {
    const { raw, prefix } = generateApiKey();
    expect(raw).toMatch(/^jtk_[a-f0-9]{40}$/);
    expect(prefix).toBe(raw.slice(0, 8));
  });

  it("hashing the same raw is idempotent and does not equal the raw", () => {
    const { raw, hash } = generateApiKey();
    expect(hashApiKey(raw)).toBe(hash);
    expect(hash).not.toBe(raw);
    expect(hash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
  });

  it("generates distinct raws on each call", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });
});
