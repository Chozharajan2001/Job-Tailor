export type RegistrationMode = "open" | "allowlist" | "closed";

export interface RegistrationPolicy {
  mode: RegistrationMode;
  allowlist: string[];
}

export type RegistrationDecision =
  | { allowed: true }
  | { allowed: false; code: "REGISTRATION_CLOSED" | "EMAIL_NOT_ALLOWED" };

const KNOWN_MODES: readonly string[] = ["open", "allowlist", "closed"];

/**
 * Self-registration policy, read live from the environment so an operator can
 * open or close sign-up without a rebuild. An unrecognised mode fails closed:
 * a typo in REGISTRATION_MODE must not leave the door open.
 */
export function registrationPolicyFromEnv(
  env: Record<string, string | undefined> = process.env,
): RegistrationPolicy {
  const raw = (env.REGISTRATION_MODE || "open").trim().toLowerCase();
  const mode = (KNOWN_MODES.includes(raw) ? raw : "closed") as RegistrationMode;
  const allowlist = (env.REGISTRATION_EMAIL_ALLOWLIST || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return { mode, allowlist };
}

export function checkRegistration(
  email: string,
  policy: RegistrationPolicy = registrationPolicyFromEnv(),
): RegistrationDecision {
  if (policy.mode === "closed") {
    return { allowed: false, code: "REGISTRATION_CLOSED" };
  }

  if (policy.mode === "open") {
    return { allowed: true };
  }

  const normalized = (email || "").trim().toLowerCase();
  if (!normalized || !policy.allowlist.includes(normalized)) {
    return { allowed: false, code: "EMAIL_NOT_ALLOWED" };
  }

  return { allowed: true };
}
