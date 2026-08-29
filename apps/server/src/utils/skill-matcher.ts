/**
 * Shared keyword/synonym matching helpers used by search ranking and the
 * alert dispatcher. Keeping these in one place guarantees identical
 * match semantics across features.
 */

/** Escape all regex metacharacters so a user string can be embedded safely. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a bounded regex pattern for a keyword, expanding common tech
 * synonyms (react/node/devops/ts/js). The input is escaped before wrapping.
 *
 * Uses lookaround boundaries instead of \b so keywords that END with a
 * non-word character (c++, c#, .net) still match correctly.
 */
export function getSynonymRegexString(word: string): string {
  const lower = word.toLowerCase();
  if (lower === "react" || lower === "reactjs" || lower === "react.js") {
    return "(?<!\\w)(react(js|\\.js)?)(?!\\w)";
  }
  if (lower === "node" || lower === "node.js" || lower === "nodejs") {
    return "(?<!\\w)(node(\\.js|js)?)(?!\\w)";
  }
  if (lower === "devops" || lower === "sre" || lower === "site reliability") {
    return "(?<!\\w)(devops|sre|site reliability)(?!\\w)";
  }
  if (lower === "typescript" || lower === "ts") {
    return "(?<!\\w)(typescript|ts)(?!\\w)";
  }
  if (lower === "javascript" || lower === "js") {
    return "(?<!\\w)(javascript|js)(?!\\w)";
  }
  return "(?<!\\w)" + escapeRegex(word) + "(?!\\w)";
}

/** Case-insensitive compiled matcher for a single keyword (with synonyms). */
export function buildKeywordMatcher(word: string): RegExp {
  return new RegExp(getSynonymRegexString(word), "i");
}
