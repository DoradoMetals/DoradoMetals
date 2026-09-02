#!/usr/bin/env bash
# Enforces explicit subagent model selection on every Agent/Task call.
# Rule: AGENTS.md "Delegating to sub-agents" — no subagent may launch without
# an explicit model (haiku | sonnet | opus), and "fable" subagents require
# Jacob's sign-off, granted per-call via ALLOW_FABLE_SUBAGENT=1.

set -euo pipefail

if [ "${ALLOW_FABLE_SUBAGENT:-}" = "1" ]; then
  exit 0
fi

payload="$(cat)"

model="$(printf '%s' "$payload" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    print("")
    sys.exit(0)
model = data.get("tool_input", {}).get("model", "")
print(model if model else "")
')"

if [ -z "$model" ]; then
  echo "Agent call blocked: set model explicitly (haiku | sonnet | opus). See AGENTS.md." >&2
  exit 2
fi

if [ "$model" = "fable" ] || [[ "$model" == claude-fable* ]]; then
  echo "Agent call blocked: fable subagents need Jacob's approval. Re-run with ALLOW_FABLE_SUBAGENT=1 after he says yes." >&2
  exit 2
fi

exit 0
