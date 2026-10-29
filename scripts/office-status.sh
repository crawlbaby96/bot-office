#!/usr/bin/env bash
# Push a bot status to the Bot Office. Dependencies: bash + curl.
#
#   office-status.sh <botId> <working|waiting|error|done|idle> "<short message>" [handoffToBotId]
#
# Env: OFFICE_URL (e.g. https://bot-office.vercel.app), OFFICE_PUSH_TOKEN.
# Never fails the calling task: on error it prints a warning and exits 0 (set OFFICE_STRICT=1 to exit 1).
set -u
# Count characters, not bytes, when truncating the message.
export LC_ALL=C.UTF-8

fail() {
  echo "office-status: $*" >&2
  if [ "${OFFICE_STRICT:-0}" = "1" ]; then exit 1; fi
  exit 0
}

[ $# -ge 2 ] || fail "usage: office-status.sh <botId> <state> \"<message>\" [handoffToBotId]"
[ -n "${OFFICE_URL:-}" ] || fail "OFFICE_URL is not set"
[ -n "${OFFICE_PUSH_TOKEN:-}" ] || fail "OFFICE_PUSH_TOKEN is not set"
command -v curl >/dev/null 2>&1 || fail "curl is required"

bot_id=$1
state=$2
message=${3:-}
handoff=${4:-}

case "$state" in
  working|waiting|error|done|idle) ;;
  *) fail "state must be one of: working waiting error done idle" ;;
esac

# Single line, collapsed whitespace, max 80 characters (the server rejects longer messages).
message=$(printf '%s' "$message" | tr '\000-\037' ' ' | tr -s ' ')
message=${message# }
message=${message% }
message=${message:0:80}

json_escape() {
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  printf '%s' "$s"
}

body="{\"botId\":\"$(json_escape "$bot_id")\",\"state\":\"$state\",\"message\":\"$(json_escape "$message")\""
if [ -n "$handoff" ]; then
  body="$body,\"handoffTo\":\"$(json_escape "$handoff")\""
fi
body="$body}"

resp_file=$(mktemp)
trap 'rm -f "$resp_file"' EXIT

# The token is passed via a header file descriptor so it never appears in the process list.
code=$(printf '%s' "$body" | curl -sS --max-time 10 -o "$resp_file" -w '%{http_code}' \
  -X POST "${OFFICE_URL%/}/api/status" \
  -H @<(printf 'Authorization: Bearer %s\n' "$OFFICE_PUSH_TOKEN") \
  -H 'Content-Type: application/json' \
  --data-binary @-) || fail "request failed"

case "$code" in
  2*) echo "office-status: $state \"$message\"" ;;
  *) fail "HTTP $code $(cat "$resp_file")" ;;
esac
