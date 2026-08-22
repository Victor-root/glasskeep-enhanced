#!/usr/bin/env bash
# Joue tous les scénarios. Sort en 1 dès qu'un scénario échoue.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAB="${FEDLAB_DIR:-$HERE/.lab}"
export NODE_EXTRA_CA_CERTS="$LAB/tls/ca.pem"
fail=0
for s in "$HERE"/t*.mjs; do
  echo "──────── $(basename "$s" .mjs) ────────"
  node "$s" || fail=1
  echo
done
[ $fail -eq 0 ] && echo "Tous les scénarios passent." || echo "Au moins un scénario a échoué."
exit $fail
