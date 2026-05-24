// ~2000 tokens. Enforced server-side at both entry points (ai.processMessage,
// messages.send); the client textarea mirrors it for UX only.
export const MAX_USER_MESSAGE_CHARS = 8000;
