#!/usr/bin/env bash
# Les vérifications qui ne demandent aucun serveur: quelques secondes,
# aucun port ouvert, aucune base créée. C'est ce que lance `npm test`, et
# c'est ce qu'on lance avant de committer.
#
# Tout ce qui a besoin de deux instances GlassKeep, de TLS ou d'un
# navigateur vit dans `npm run test:integration`.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

fail=0
run() {
  echo "──────── $1 ────────"
  shift
  node "$@" || fail=1
  echo
}

# Les invariants: des règles d'architecture que l'audit a supposées
# vraies et que rien ne tenait.
run "invariants: assainissement avant affichage" "$HERE/invariants/t16-sanitize-before-display.mjs"

# Les règles de sécurité pures, sans réseau ni serveur.
run "politique de confiance des intermédiaires" "$HERE/federation/t7-trust-policy.mjs"
run "règles pures (adresses IA, TLS des scripts, style, chiffrement, connexion, passkeys)" \
    "$HERE/unit/t18-pure-rules.mjs"
run "un 401 sans jeton ne déconnecte pas" "$HERE/unit/t19-unauthenticated-401.mjs"

if [ $fail -eq 0 ]; then
  echo "Tout passe."
else
  echo "Au moins une vérification a échoué."
fi
exit $fail
