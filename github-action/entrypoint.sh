#!/usr/bin/env bash
set -euo pipefail

API="${NETSCOPE_API_URL:-https://api.netscope.io}"
TARGET="${TARGET:?target required}"
FAIL_BELOW="${FAIL_BELOW:-B}"
FAIL_SSL_DAYS="${FAIL_SSL_DAYS:-14}"
AUTH=()
if [[ -n "${NETSCOPE_API_KEY:-}" ]]; then AUTH=(-H "X-API-Key: ${NETSCOPE_API_KEY}"); fi

strip_scheme() { echo "${1#https://}" | sed 's|/.*||'; }

echo "::group::HTTP header audit"
url="${TARGET}"
if [[ ! "$url" =~ ^https?:// ]]; then url="https://${url}"; fi
headers_json=$(curl -fsS --max-time 30 "${AUTH[@]}" "${API}/api/v1/headers?url=$(printf '%s' "$url" | jq -sRr @uri)")
grade=$(echo "$headers_json" | jq -r '.grade')
score=$(echo "$headers_json" | jq -r '.score')
echo "Grade: $grade ($score/100)"
echo "$headers_json" | jq -r '.checks[] | "  \(if .good then "✓" elif .present then "~" else "✗" end) \(.header)"'
echo "header-grade=$grade" >> "$GITHUB_OUTPUT"
echo "::endgroup::"

echo "::group::SSL audit"
host=$(strip_scheme "$TARGET")
ssl_json=$(curl -fsS --max-time 30 "${AUTH[@]}" "${API}/api/v1/ssl-grade/${host}")
ssl_grade=$(echo "$ssl_json" | jq -r '.grade')
days=$(echo "$ssl_json" | jq -r '.daysUntilExpiry')
echo "SSL Grade: $ssl_grade — $days days until expiry"
echo "$ssl_json" | jq -r '.findings[]? | "  • \(.)"'
echo "ssl-grade=$ssl_grade" >> "$GITHUB_OUTPUT"
echo "ssl-days-left=$days" >> "$GITHUB_OUTPUT"
echo "::endgroup::"

# GitHub Actions job summary
{
  echo "## NetScope audit: \`$TARGET\`"
  echo ""
  echo "| Check | Result |"
  echo "|---|---|"
  echo "| HTTP header grade | **$grade** ($score/100) |"
  echo "| SSL grade         | **$ssl_grade** |"
  echo "| Cert expiry       | $days days |"
} >> "$GITHUB_STEP_SUMMARY"

rank() { case "$1" in A+) echo 6;; A) echo 5;; B) echo 4;; C) echo 3;; D) echo 2;; E) echo 1;; *) echo 0;; esac; }
if [[ $(rank "$grade") -lt $(rank "$FAIL_BELOW") ]]; then
  echo "::error::Header grade $grade is below minimum $FAIL_BELOW"; exit 1
fi
if [[ $(rank "$ssl_grade") -lt $(rank "$FAIL_BELOW") ]]; then
  echo "::error::SSL grade $ssl_grade is below minimum $FAIL_BELOW"; exit 1
fi
if [[ "$days" != "null" && "$days" -lt "$FAIL_SSL_DAYS" ]]; then
  echo "::error::Cert expires in $days days (below $FAIL_SSL_DAYS)"; exit 1
fi
echo "✓ all checks passed"
