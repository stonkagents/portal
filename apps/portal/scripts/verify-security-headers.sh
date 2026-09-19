#!/usr/bin/env bash
# Verify security headers on a deployed portal
# Usage: ./scripts/verify-security-headers.sh https://portal.example.com

set -euo pipefail

URL="${1:?Usage: $0 <deployed-url>}"
PASS=0
FAIL=0

check_header() {
  local header="$1"
  local value
  value=$(curl -sI "$URL" | grep -i "^${header}:" | head -1)
  if [ -n "$value" ]; then
    printf "  ✓ %s: %s\n" "$header" "${value#*: }"
    ((PASS++))
  else
    printf "  ✗ %s: MISSING\n" "$header"
    ((FAIL++))
  fi
}

printf "Checking security headers for: %s\n\n" "$URL"

check_header "Content-Security-Policy"
check_header "X-Frame-Options"
check_header "X-Content-Type-Options"
check_header "Strict-Transport-Security"
check_header "Referrer-Policy"

printf "\nResults: %d passed, %d failed\n" "$PASS" "$FAIL"

[ "$FAIL" -eq 0 ] || exit 1
