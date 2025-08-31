#!/usr/bin/env sh
# Simple CPU load test: enqueue multiple YouTube imports concurrently
# Usage: API=http://localhost:8000 TOKEN=<jwt> COUNT=5 URL='<yt-url>' ./scripts/load-test.sh

set -eu

API=${API:-http://localhost:8000}
TOKEN=${TOKEN:-}
COUNT=${COUNT:-5}
URL=${URL:-https://www.youtube.com/watch?v=dQw4w9WgXcQ}

if [ -z "$TOKEN" ]; then
  echo "TOKEN env var (JWT) required"
  exit 1
fi

echo "Queuing $COUNT imports to $API"
i=0
while [ $i -lt $COUNT ]; do
  i=$((i+1))
  curl -fsS -X POST "$API/api/v1/videos" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"youtube_url\":\"$URL\",\"title\":\"loadtest_$i\"}" \
    >/dev/null &
  # brief stagger to avoid the same-second timestamps
  sleep 0.2
done
wait || true
echo "Done. Check /api/v1/videos for queued/processing items."
