#!/bin/bash
# PostToolUse hook: Build MCP server after Write/Edit
# Triggered after editing files in apps/mcp-server/

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty')

# Only build if the edited file is inside apps/mcp-server/
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Normalize path separators for Windows compatibility
NORMALIZED=$(echo "$FILE_PATH" | sed 's|\\|/|g')

if ! echo "$NORMALIZED" | grep -q 'apps/mcp-server/'; then
  exit 0
fi

# Run MCP server build from the project root
cd "$CLAUDE_PROJECT_DIR" || exit 0
npm run mcp:build 2>&1

BUILD_EXIT=$?
if [ $BUILD_EXIT -ne 0 ]; then
  echo "MCP server TypeScript build failed. Please fix compilation errors." >&2
  exit 2
fi

exit 0
