#!/usr/bin/env bash
# Joue tous les scénarios. Sort en 1 dès qu'un scénario échoue.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAB="${FEDLAB_DIR:-$HERE/.lab}"
export NODE_EXTRA_CA_CERTS="$LAB/tls/ca.pem"
# Les scénarios d'attaque savent jouer les deux rôles: décrire un serveur
# vulnérable, ou un serveur corrigé. En suite de non-régression on attend
# évidemment le second.
export EXPECT="${EXPECT:-fixed}"
fail=0
for s in "$HERE"/t*.mjs; do
  echo "──────── $(basename "$s" .mjs) ────────"
  node "$s" || fail=1
  echo
done
[ $fail -eq 0 ] && echo "Tous les scénarios passent." || echo "Au moins un scénario a échoué."
exit $fail
