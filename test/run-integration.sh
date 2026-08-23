#!/usr/bin/env bash
# La suite complète: monte une autorité de certification locale, deux
# instances GlassKeep qui s'appairent réellement en TLS vérifié, et joue
# tous les scénarios. Quelques minutes, et il faut des ports libres.
#
# Prend en charge le montage et le démontage, pour qu'il n'y ait qu'une
# commande à retenir. Le bac à sable est démonté même si un scénario
# échoue, sinon des serveurs restent en fond.
#
# Demande `openssl`. La partie navigateur du scénario 14 se signale
# ignorée si aucun Chromium n'est trouvé.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() { "$HERE/federation/teardown.sh" >/dev/null 2>&1 || true; }
trap cleanup EXIT

"$HERE/federation/setup.sh" || exit 1
"$HERE/federation/run.sh"
fed=$?

# Les scénarios fonctionnels montent leurs propres instances et n'ont
# besoin de rien de tout cela, mais une commande qui dit « tout est vert »
# doit vraiment avoir tout joué.
"$HERE/run-functional.sh"
fonc=$?

[ $fed -eq 0 ] && [ $fonc -eq 0 ]
