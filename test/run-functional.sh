#!/usr/bin/env bash
# Les scénarios fonctionnels: est-ce que l'application fait ce qu'elle
# promet. Chacun démarre sa propre instance sur son propre port, dans sa
# propre base temporaire, et nettoie derrière lui.
#
# Ni autorité de certification, ni openssl, ni second serveur: c'est la
# différence avec `npm run test:integration`, qui monte le banc d'essai
# de la fédération.
set -uo pipefail
shopt -s nullglob
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

scenarios=("$HERE"/functional/f*.mjs)
if [ ${#scenarios[@]} -eq 0 ]; then
  echo "Aucun scénario fonctionnel trouvé dans $HERE/functional."
  exit 1
fi

fail=0
for s in "${scenarios[@]}"; do
  echo "──────── $(basename "$s" .mjs) ────────"
  node "$s" || fail=1
  echo
done

if [ $fail -eq 0 ]; then
  echo "Tous les scénarios fonctionnels passent."
else
  echo "Au moins un scénario fonctionnel a échoué."
fi
exit $fail
