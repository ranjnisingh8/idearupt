#!/bin/bash
# Pre-generate content for all ideas in batches
# Runs batch_size=3 every 3 minutes to avoid Supabase free-tier WORKER_LIMIT
# Usage: ./scripts/pre-generate-batch.sh
# Logs to: scripts/pre-generate.log

SUPABASE_URL="https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/pre-generate-content"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzZXVwcm1jZ3VpcWdyZGNxZXhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1Mzg2MzAsImV4cCI6MjA4NjExNDYzMH0.QAVQVKV5bMLcIibYREVrqWuT7v36d1HP8sIYVDRqRSY"
BATCH_SIZE=3
INTERVAL=180  # 3 minutes between batches
MAX_RETRIES=3
LOG_FILE="$(dirname "$0")/pre-generate.log"

echo "========================================" | tee -a "$LOG_FILE"
echo "[$(date)] Starting pre-generate batch runner" | tee -a "$LOG_FILE"
echo "Batch size: $BATCH_SIZE | Interval: ${INTERVAL}s" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"

total_processed=0
total_bp_ok=0
total_comp_ok=0
batch_num=0
consecutive_empty=0

while true; do
  batch_num=$((batch_num + 1))
  retries=0
  success=false

  while [ $retries -lt $MAX_RETRIES ]; do
    echo "[$(date)] Batch #$batch_num (attempt $((retries + 1)))" | tee -a "$LOG_FILE"

    response=$(curl -s -m 300 -X POST "$SUPABASE_URL" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $ANON_KEY" \
      -d "{\"batch_size\": $BATCH_SIZE}" 2>&1)

    # Check for WORKER_LIMIT or 502
    if echo "$response" | grep -q "WORKER_LIMIT\|502 Bad Gateway\|Bad Gateway"; then
      retries=$((retries + 1))
      wait_time=$((INTERVAL * retries))
      echo "[$(date)]   Rate limited. Waiting ${wait_time}s before retry..." | tee -a "$LOG_FILE"
      sleep "$wait_time"
      continue
    fi

    # Check for success
    if echo "$response" | grep -q '"success":true'; then
      success=true
      ideas=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['stats']['ideas_processed'])" 2>/dev/null || echo "?")
      bp_ok=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['stats']['blueprint_succeeded'])" 2>/dev/null || echo "?")
      comp_ok=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['stats']['competitor_succeeded'])" 2>/dev/null || echo "?")
      elapsed=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['stats']['elapsed_ms'])" 2>/dev/null || echo "?")

      total_processed=$((total_processed + ideas))
      total_bp_ok=$((total_bp_ok + bp_ok))
      total_comp_ok=$((total_comp_ok + comp_ok))

      echo "[$(date)]   ✓ Processed $ideas ideas (bp: $bp_ok, comp: $comp_ok) in ${elapsed}ms" | tee -a "$LOG_FILE"
      echo "[$(date)]   Running total: $total_processed ideas ($total_bp_ok blueprints, $total_comp_ok competitors)" | tee -a "$LOG_FILE"

      # If 0 ideas processed, we might be done
      if [ "$ideas" = "0" ]; then
        consecutive_empty=$((consecutive_empty + 1))
      else
        consecutive_empty=0
      fi
      break
    fi

    # Unknown error
    echo "[$(date)]   Error: $response" | tee -a "$LOG_FILE"
    retries=$((retries + 1))
    sleep "$INTERVAL"
  done

  if [ "$success" = false ]; then
    echo "[$(date)]   Failed after $MAX_RETRIES retries. Waiting ${INTERVAL}s..." | tee -a "$LOG_FILE"
    sleep "$INTERVAL"
    continue
  fi

  # Stop if 3 consecutive batches returned 0 ideas
  if [ $consecutive_empty -ge 3 ]; then
    echo "" | tee -a "$LOG_FILE"
    echo "========================================" | tee -a "$LOG_FILE"
    echo "[$(date)] ALL DONE!" | tee -a "$LOG_FILE"
    echo "Total processed: $total_processed ideas" | tee -a "$LOG_FILE"
    echo "Blueprints generated: $total_bp_ok" | tee -a "$LOG_FILE"
    echo "Competitors generated: $total_comp_ok" | tee -a "$LOG_FILE"
    echo "========================================" | tee -a "$LOG_FILE"
    exit 0
  fi

  echo "[$(date)]   Waiting ${INTERVAL}s before next batch..." | tee -a "$LOG_FILE"
  sleep "$INTERVAL"
done
