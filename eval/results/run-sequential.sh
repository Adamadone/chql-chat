#!/usr/bin/env bash
# Sequential eval runner. Fires startEval and polls for the action to finish
# server-side (CLI times out at ~5 min but the action keeps going).

set -u
cd "$(dirname "$0")/../.."

MODELS=(claude-haiku-4-5 gpt-5.4 gpt-5.3-chat-latest claude-sonnet-4-6 claude-opus-4-7)
LOG=eval/results/sequential.log
: > "$LOG"

RUN_IDS=()

for m in "${MODELS[@]}"; do
    checkpoint_ms=$(($(date +%s%N)/1000000))
    echo "=== $(date -Iseconds) firing $m (checkpoint=$checkpoint_ms) ===" | tee -a "$LOG"

    # Fire the action; CLI will exit at ≤5 min but Convex action continues
    npx dotenvx run -- npx convex run evaluation:startEval "{\"modelId\":\"$m\"}" >> "$LOG" 2>&1 &
    CLI_PID=$!

    # Poll every 30s for a NEW completed run of this modelId (startedAt >= checkpoint)
    # Give up after 20 min per model
    deadline=$(( $(date +%s) + 1200 ))
    run_id=""
    status=""
    while [[ -z "$run_id" ]]; do
        if (( $(date +%s) > deadline )); then
            echo "!!! $m: deadline exceeded, giving up" | tee -a "$LOG"
            break
        fi
        sleep 30
        # Query only this model's runs
        raw=$(npx dotenvx run -- npx convex run "evaluationHelpers:listRuns" "{\"modelId\":\"$m\"}" 2>/dev/null | sed $'s/\x1b\\[[0-9;]*m//g')
        # Find first line starting at [, take from there (strip dotenvx prefix line)
        json=$(printf '%s' "$raw" | awk '/^\[/{f=1} f')
        # Use python to find a completed run with startedAt >= checkpoint
        read -r run_id status <<EOF
$(printf '%s' "$json" | python -c "
import json, sys
try:
    runs = json.load(sys.stdin)
except Exception:
    print('', '')
    sys.exit()
cp = $checkpoint_ms
matches = [r for r in runs if r.get('startedAt', 0) >= cp]
if not matches:
    print('', 'none-yet')
    sys.exit()
# Pick latest match
m = max(matches, key=lambda x: x['startedAt'])
print(m['_id'], m.get('status','?'))
")
EOF
        echo "    poll $(date -Iseconds): $m status=$status id=$run_id" | tee -a "$LOG"
        if [[ "$status" == "completed" || "$status" == "failed" ]]; then
            break
        fi
        run_id=""  # keep polling if still running
    done

    # CLI may still be blocking; make sure it's reaped (it will have exited or will soon)
    wait $CLI_PID 2>/dev/null || true

    if [[ -n "$run_id" ]]; then
        RUN_IDS+=("$run_id")
        echo "=== $(date -Iseconds) $m DONE → $run_id ($status) ===" | tee -a "$LOG"
    else
        echo "=== $(date -Iseconds) $m FAILED ===" | tee -a "$LOG"
    fi
done

echo "" | tee -a "$LOG"
echo "All runs done. Run IDs:" | tee -a "$LOG"
printf '%s\n' "${RUN_IDS[@]}" | tee -a "$LOG"

# Write JSON array of runIds for the export step
python -c "
import json, sys
ids = '''${RUN_IDS[*]}'''.split()
print(json.dumps({'runIds': ids}))
" > eval/results/run-ids.json
echo "Wrote eval/results/run-ids.json" | tee -a "$LOG"
