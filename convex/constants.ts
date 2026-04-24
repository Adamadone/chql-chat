/**
 * Maximum character length of a single user message sent through the chat.
 *
 * Enforced at two server-side entry points: the `processMessage` action in
 * `convex/ai.ts` and the `messages.send` mutation in `convex/messages.ts`.
 * The client textarea mirrors this value for UX but is not authoritative.
 *
 * 8 000 characters is roughly 2 000 tokens — generous for natural-language
 * questions about measurement data while bounding cost and prompt-injection
 * payload size.
 */
export const MAX_USER_MESSAGE_CHARS = 8000;
