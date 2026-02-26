#!/bin/bash
# PostToolUse hook: Run ESLint check on web app after Write/Edit
# Triggered after editing files in apps/web/

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty')

# Only lint if the edited file is inside apps/web/
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Normalize path separators for Windows compatibility
NORMALIZED=$(echo "$FILE_PATH" | sed 's|\\|/|g')

if ! echo "$NORMALIZED" | grep -q 'apps/web/'; then
  exit 0
fi

# Run ESLint on the specific file from the web app workspace
cd "$CLAUDE_PROJECT_DIR" || exit 0
npx eslint "$FILE_PATH" 2>&1

LINT_EXIT=$?
if [ $LINT_EXIT -ne 0 ]; then
  echo "ESLint found issues in the edited file. Please fix them." >&2
  exit 2
fi

exit 0
