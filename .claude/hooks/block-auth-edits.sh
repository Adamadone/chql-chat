#!/bin/bash
# PreToolUse hook: Block direct edits to Convex Auth-managed files
# These files are managed by @convex-dev/auth and should not be manually edited.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Normalize path separators for Windows compatibility
NORMALIZED=$(echo "$FILE_PATH" | sed 's|\\|/|g')

# Block edits to convex/auth.ts and convex/auth.config.ts
if echo "$NORMALIZED" | grep -qE 'convex/auth\.(ts|config\.ts)$'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "convex/auth.ts and convex/auth.config.ts are managed by @convex-dev/auth. Do not edit these files directly unless the user explicitly asks you to modify auth configuration."
    }
  }'
  exit 0
fi

exit 0
