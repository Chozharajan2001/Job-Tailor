/**
 * Convert a job-posting HTML body to plain text suitable for the description
 * field on CanonicalJob. Strips tags, decodes common entities, and collapses
 * runs of whitespace while preserving paragraph breaks.
 *
 * Not a general-purpose HTML parser — job API bodies use a narrow subset
 * (p, br, ul, ol, li, strong, em, a). This is deliberate: pulling in a real
 * HTML parser is overkill for text we're going to hand to an LLM anyway.
 */
export function htmlToText(html: string): string {
  if (!html) return "";
  return (
    html
      // Convert structural tags to whitespace before stripping.
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n\n")
      // Drop remaining tags.
      .replace(/<[^>]+>/g, "")
      // Common entities.
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Collapse excessive blank lines.
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
