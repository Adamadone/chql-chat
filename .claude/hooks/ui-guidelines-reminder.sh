#!/bin/bash
# PreToolUse hook: Inject UI Guidelines context when writing/editing component files
# Reminds Claude to follow docs/UI_GUIDELINES.md when touching UI components.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Normalize path separators for Windows compatibility
NORMALIZED=$(echo "$FILE_PATH" | sed 's|\\|/|g')

# Only trigger for files in apps/web/src/components/
if ! echo "$NORMALIZED" | grep -q 'apps/web/src/components/'; then
  exit 0
fi

jq -n '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow",
    additionalContext: "IMPORTANT: You are editing a UI component. Follow the project UI design guidelines in docs/UI_GUIDELINES.md. Key rules: use shadcn/ui primitives from apps/web/src/components/ui/, use Tailwind CSS utility classes, follow the existing component patterns in the codebase."
  }
}'
exit 0
