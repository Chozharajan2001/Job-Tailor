import { describe, it, expect } from "vitest";
import {
  checkRegistration,
  registrationPolicyFromEnv,
} from "../utils/registration-gate.js";

const envWith = (over: Record<string, string>) =>
  ({ NODE_ENV: "test", ...over }) as Record<string, string | undefined>;

describe("registration gate (H7)", () => {
  it("defaults to open when no env is set", () => {
    expect(registrationPolicyFromEnv(envWith({}))).toEqual({
      mode: "open",
      allowlist: [],
    });
    expect(
      checkRegistration("anyone@example.com", { mode: "open", allowlist: [] }),
    ).toEqual({
      allowed: true,
    });
  });

  it("accepts a listed address and refuses an unlisted one", () => {
    const policy = registrationPolicyFromEnv(
      envWith({
        REGISTRATION_MODE: "allowlist",
        REGISTRATION_EMAIL_ALLOWLIST: " Founder@Acme.Co , dev@acme.co ",
      }),
    );
    expect(policy.allowlist).toEqual(["founder@acme.co", "dev@acme.co"]);
    expect(checkRegistration("founder@acme.co", policy)).toEqual({
      allowed: true,
    });
    expect(checkRegistration("FOUNDER@ACME.CO", policy)).toEqual({
      allowed: true,
    });
    expect(checkRegistration("stranger@gmail.com", policy)).toEqual({
      allowed: false,
      code: "EMAIL_NOT_ALLOWED",
    });
  });

  it("fails closed when allowlist mode is on but the list is empty", () => {
    const policy = registrationPolicyFromEnv(
      envWith({ REGISTRATION_MODE: "allowlist" }),
    );
    expect(policy.mode).toBe("allowlist");
    expect(checkRegistration("anyone@example.com", policy)).toEqual({
      allowed: false,
      code: "EMAIL_NOT_ALLOWED",
    });
  });

  it("refuses every address when registration is closed", () => {
    const policy = registrationPolicyFromEnv(
      envWith({
        REGISTRATION_MODE: "closed",
        REGISTRATION_EMAIL_ALLOWLIST: "founder@acme.co",
      }),
    );
    expect(checkRegistration("founder@acme.co", policy)).toEqual({
      allowed: false,
      code: "REGISTRATION_CLOSED",
    });
  });

  it("treats an unrecognised mode as closed", () => {
    const policy = registrationPolicyFromEnv(
      envWith({ REGISTRATION_MODE: "pls-be-open" }),
    );
    expect(policy.mode).toBe("closed");
    expect(checkRegistration("anyone@example.com", policy).allowed).toBe(false);
  });

  it("refuses an empty address under allowlist mode", () => {
    const policy = registrationPolicyFromEnv(
      envWith({
        REGISTRATION_MODE: "allowlist",
        REGISTRATION_EMAIL_ALLOWLIST: "founder@acme.co",
      }),
    );
    expect(checkRegistration("   ", policy)).toEqual({
      allowed: false,
      code: "EMAIL_NOT_ALLOWED",
    });
  });
});
