export function extractAndParseJson<T>(content: string): T {
  const trimmed = content.trim();
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let candidate = codeBlockMatch?.[1]?.trim() ?? trimmed;

  if (!codeBlockMatch) {
    const objectStart = candidate.indexOf('{');
    const objectEnd = candidate.lastIndexOf('}');
    const arrayStart = candidate.indexOf('[');
    const arrayEnd = candidate.lastIndexOf(']');

    if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
      candidate = candidate.slice(objectStart, objectEnd + 1);
    } else if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
      candidate = candidate.slice(arrayStart, arrayEnd + 1);
    }
  }

  return JSON.parse(candidate) as T;
}
