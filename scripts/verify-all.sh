#!/usr/bin/env bash
# Run every milestone verification (M0–M8) in sequence.
# Prereqs: all services + console running (see README boot sequence).
set -u
here="$(dirname "$0")"
fail=0
summary=""
for m in m0 m1 m2 m3 m4 m5 m6 m7 m8; do
  echo "################  verify-$m  ################"
  if bash "$here/verify-$m.sh"; then
    summary="${summary}  PASS  ${m}
"
  else
    summary="${summary}  FAIL  ${m}
"
    fail=$((fail + 1))
  fi
  echo
done
echo "════════════════════════════════════════"
echo "  Milestone summary:"
printf "%s" "$summary"
echo "════════════════════════════════════════"
if [ "$fail" -eq 0 ]; then
  echo "  ✅ ALL MILESTONES GREEN (M0-M8)"
else
  echo "  ❌ $fail milestone(s) failed"
fi
exit "$fail"
