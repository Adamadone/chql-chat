// See ./CONTEXT.md for module overview.
// Strips hallucinated tool/function tags from LLM text (injection defense) and collapses the blank lines they leave behind.
export function stripToolTags(text: string): string {
  return text
    .replace(
      /<\/?(?:tool_call|tool_response|function_call|function_response)[^>]*>/gi,
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
