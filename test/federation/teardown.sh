#!/usr/bin/env bash
# Arrête les deux instances. --keep-tls conserve l'autorité et les certificats.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAB="${FEDLAB_DIR:-$HERE/.lab}"
for f in "$LAB/alpha/pid" "$LAB/beta/pid"; do
  [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null
  rm -f "$f"
done
sleep 1
if [ "${1:-}" != "--keep-tls" ]; then rm -rf "$LAB"; fi
