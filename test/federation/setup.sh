#!/usr/bin/env bash
# Monte deux instances GlassKeep qui se parlent en HTTPS vérifié, sur la
# machine locale. La fédération refuse le HTTP en clair et vérifie la chaîne
# de certification, donc un simple "npm run dev" ne suffit pas: il faut une
# autorité de certification locale et deux certificats qu'elle signe.
#
# Les deux instances tournent sur "localhost", à des ports différents. Cela
# suffit à en faire deux origines distinctes aux yeux du code de fédération,
# et évite d'avoir à toucher /etc/hosts.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
LAB="${FEDLAB_DIR:-$HERE/.lab}"
PORT_A="${FEDLAB_PORT_A:-9443}"
PORT_B="${FEDLAB_PORT_B:-9444}"

mkdir -p "$LAB/tls" "$LAB/alpha" "$LAB/beta"

if [ ! -f "$LAB/tls/ca.pem" ]; then
  echo "→ autorité de certification locale"
  openssl req -x509 -newkey rsa:2048 -sha256 -days 30 -nodes \
    -keyout "$LAB/tls/ca.key" -out "$LAB/tls/ca.pem" \
    -subj "/CN=GlassKeep Fed Lab CA" 2>/dev/null
  openssl req -newkey rsa:2048 -nodes -keyout "$LAB/tls/node.key" \
    -out "$LAB/tls/node.csr" -subj "/CN=localhost" 2>/dev/null
  printf 'subjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' \
    > "$LAB/tls/node.ext"
  openssl x509 -req -in "$LAB/tls/node.csr" -CA "$LAB/tls/ca.pem" -CAkey "$LAB/tls/ca.key" \
    -CAcreateserial -out "$LAB/tls/node.pem" -days 30 -sha256 -extfile "$LAB/tls/node.ext" 2>/dev/null
fi

start_one() {
  local name=$1 port=$2
  DB_FILE="$LAB/$name/data.sqlite" \
  JWT_SECRET="$(openssl rand -hex 32)" \
  API_PORT="$port" \
  NODE_ENV=production \
  HTTPS_ENABLED=true \
  SSL_CERT="$LAB/tls/node.pem" \
  SSL_KEY="$LAB/tls/node.key" \
  NODE_EXTRA_CA_CERTS="$LAB/tls/ca.pem" \
  FEDERATION_TICK_MS=5000 \
  nohup node "$ROOT/server/index.js" > "$LAB/$name/server.log" 2>&1 &
  echo $! > "$LAB/$name/pid"
}

"$HERE/teardown.sh" --keep-tls || true
rm -f "$LAB"/alpha/data.sqlite* "$LAB"/beta/data.sqlite*

echo "→ démarrage des deux instances"
start_one alpha "$PORT_A"
start_one beta  "$PORT_B"
sleep 5   # laisser le schéma se créer

echo "→ création des comptes"
node "$HERE/seed.cjs" "$LAB/alpha/data.sqlite" alpha
node "$HERE/seed.cjs" "$LAB/beta/data.sqlite"  beta

for hp in "alpha:$PORT_A" "beta:$PORT_B"; do
  printf '%s: ' "${hp%%:*}"
  curl -sS --noproxy '*' --max-time 8 --cacert "$LAB/tls/ca.pem" \
    "https://localhost:${hp##*:}/api/health" || echo INJOIGNABLE
  echo
done
echo "Prêt. Lancez: test/federation/run.sh"
