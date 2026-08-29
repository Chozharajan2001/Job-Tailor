/**
 * URL sanitizer for rendering external/user-supplied URLs as anchors.
 * Blocks dangerous schemes (javascript:, data:, vbscript:, file: ...)
 * to prevent XSS via crafted href values.
 */
const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:"]);

export function sanitizeUrl(
  url: string | undefined | null,
  fallback = "#",
): string {
  if (!url) return fallback;

  try {
    const parsed = new URL(url);
    if (SAFE_SCHEMES.has(parsed.protocol)) {
      return parsed.toString();
    }
  } catch {
    // Relative URLs (e.g. "/tracker") are fine for internal navigation
    if (
      typeof url === "string" &&
      url.startsWith("/") &&
      !url.startsWith("//")
    ) {
      return url;
    }
  }

  return fallback;
}
