/**
 * @module @chql-chat/chql-core/sanitize — Output sanitiser for LLM text
 *
 * Strips XML-like tool tags that an LLM may hallucinate in its text
 * output. Part of the prompt-injection defense: if the model emits fake
 * `<tool_call>`, `<tool_response>`, `<function_call>`, or
 * `<function_response>` tags in its visible reply, they're removed
 * before the response is stored or displayed.
 *
 * Also collapses excessive blank lines left behind by the removal.
 */
export function stripToolTags(text: string): string {
  return text
    .replace(
      /<\/?(?:tool_call|tool_response|function_call|function_response)[^>]*>/gi,
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
