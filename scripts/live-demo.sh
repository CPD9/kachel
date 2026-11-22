#!/usr/bin/env bash
# The stage demo with no hand on the keyboard (#191): one command starts a real embedding job,
# the agent that pauses and resumes it, and the scheduler's live loop. The loop replays a January
# day and a July day (LIVE_PACE seconds an hour, about 60 s a day) with the same decide() as the
# yearly balance and writes the agent's signal file itself. Ctrl-C stops all three; the job is
# resumed before it is stopped, so nothing is left frozen.
#
#   make live-demo                      # from the repo root, after make dev and make db-reset
#   LIVE_PACE=1 make live-demo          # faster
#   LIVE_DAYS="2025-07-15" make live-demo
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=services/agent/.env
[[ -f $ENV_FILE ]] || { echo "No $ENV_FILE: copy services/agent/.env.example and fill in the keys." >&2; exit 1; }
set -a; source "$ENV_FILE"; set +a

JOB_ID=00000000-0000-4000-8000-000000000304      # supabase/seed.sql: Embeddings backlog, part 3
SERVER_ID=00000000-0000-4000-8000-000000000204   # Server 4 of the reference house
WORK=${LIVE_WORK:-${TMPDIR:-/tmp}/kachel-live}
SIGNAL=$WORK/heat
PACE=${LIVE_PACE:-2.5}
DAYS=${LIVE_DAYS:-2025-01-13 2025-07-15}
mkdir -p "$WORK"
# One run at a time: a second one would start another job and agent on the same signal file.
exec 9> "$WORK/lock"
flock -n 9 || { echo "make live-demo is already running (lock $WORK/lock); stop it with Ctrl-C first." >&2; exit 1; }
rm -f "$WORK/progress.json"

# The job and the agent run on their own venvs' Python, so $! is the process itself and not a
# uv wrapper: the agent must stop the job's own PID.
uv sync -q --project services/scheduler
uv sync -q --project services/agent
echo run > "$SIGNAL"
JOB_ITEMS=100000000 services/scheduler/.venv/bin/python services/scheduler/jobs/embed_job.py \
  "$WORK/progress.json" > "$WORK/job.log" 2>&1 &
JOB=$!
services/agent/.venv/bin/python -m kachel_agent --pid "$JOB" --signal "$SIGNAL" --tick 0.2 \
  --job-id "$JOB_ID" --server-id "$SERVER_ID" > "$WORK/agent.log" 2>&1 &
AGENT=$!

stop() {
  kill "$AGENT" 2>/dev/null || true
  kill -CONT "$JOB" 2>/dev/null || true
  kill "$JOB" 2>/dev/null || true
  wait 2>/dev/null || true
  echo "Stopped the job ($JOB) and the agent. Agent log: $WORK/agent.log"
}
trap stop EXIT

echo "Real job pid $JOB on Server 4, agent pid $AGENT following $SIGNAL"
day_args=()
for d in $DAYS; do day_args+=(--day "$d"); done
cd services/scheduler
uv run python live.py --agent "$JOB_ID=$SIGNAL" --seconds-per-hour "$PACE" "${day_args[@]}" ${LIVE_ARGS:-}
