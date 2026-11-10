#!/usr/bin/env bash
# PostToolUse hook: typechecks after every TypeScript edit so Claude sees errors immediately.
set -uo pipefail
input="$(cat)"
file="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);process.stdout.write(j.tool_input?.file_path ?? "")})')"
case "$file" in
  *.ts)
    cd "$CLAUDE_PROJECT_DIR"
    if ! out="$(npx --no-install tsc --noEmit 2>&1)"; then
      echo "Typecheck failed after editing $file:" >&2
      echo "$out" | head -40 >&2
      exit 2
    fi ;;
esac
exit 0
