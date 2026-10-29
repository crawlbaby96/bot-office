#!/usr/bin/env bash
# Push a weekly usage reading to the Bot Office usage board. Dependencies: bash + curl.
#
#   office-usage.sh <percentLeft> <resetsAtISO> [readAtISO]
#
# Env: OFFICE_URL, OFFICE_PUSH_TOKEN. readAt defaults to now (UTC).
set -u

fail() {
  echo "office-usage: $*" >&2
  if [ "${OFFICE_STRICT:-0}" = "1" ]; then exit 1; fi
  exit 0
}

[ $# -ge 2 ] || fail "usage: office-usage.sh <percentLeft> <resetsAtISO> [readAtISO]"
[ -n "${OFFICE_URL:-}" ] || fail "OFFICE_URL is not set"
[ -n "${OFFICE_PUSH_TOKEN:-}" ] || fail "OFFICE_PUSH_TOKEN is not set"

percent=$1
resets_at=$2
read_at=${3:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}

case "$percent" in
  ''|*[!0-9.]*) fail "percentLeft must be a number" ;;
esac
case "$resets_at$read_at" in
  *[!0-9A-Za-z:.+-]*) fail "dates must be ISO-8601" ;;
esac

body="{\"percentLeft\":$percent,\"resetsAt\":\"$resets_at\",\"readAt\":\"$read_at\"}"
resp_file=$(mktemp)
trap 'rm -f "$resp_file"' EXIT

code=$(printf '%s' "$body" | curl -sS --max-time 10 -o "$resp_file" -w '%{http_code}' \
  -X POST "${OFFICE_URL%/}/api/usage" \
  -H @<(printf 'Authorization: Bearer %s\n' "$OFFICE_PUSH_TOKEN") \
  -H 'Content-Type: application/json' \
  --data-binary @-) || fail "request failed"

case "$code" in
  2*) echo "office-usage: ${percent}% left, resets $resets_at, read $read_at" ;;
  *) fail "HTTP $code $(cat "$resp_file")" ;;
esac
