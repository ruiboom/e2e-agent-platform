#!/usr/bin/env bash
# Run every hardening verification (H1–H6). Requires the platform services +
# console running; starts/stops the local OIDC test issuer for H6.
set -u
here="$(dirname "$0")"
lsof -ti:9099 2>/dev/null | xargs kill 2>/dev/null
node "$here/oidc-test-issuer.mjs" > /tmp/oidc-issuer.log 2>&1 &
issuer=$!
sleep 2

fail=0
summary=""
for h in audit policy retention pii embed oidc; do
  echo "################  verify-h-$h  ################"
  if bash "$here/verify-h-$h.sh"; then summary="${summary}  PASS  H-${h}
"; else summary="${summary}  FAIL  H-${h}
"; fail=$((fail + 1)); fi
  echo
done

kill "$issuer" 2>/dev/null
echo "════════════════════════════════════════"
printf "%s" "$summary"
echo "════════════════════════════════════════"
[ "$fail" -eq 0 ] && echo "  ✅ ALL HARDENING GREEN (H1-H6)" || echo "  ❌ $fail hardening item(s) failed"
exit "$fail"
