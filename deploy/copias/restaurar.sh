#!/bin/sh
# Devolve uma copia. Roda dentro do servico de copias (que ja tem o pg_restore e o mc):
#
#   restaurar.sh banco /copias/banco/relatofacil-AAAAMMDD-HHMM.dump
#   restaurar.sh midia
#
# O banco: apaga o que existe e recria a partir da copia. Pare a API antes
# (docker service scale relatofacil_api=0) e volte depois (=1).
# A midia: devolve ao balde o que estiver no espelho e faltar la; nao apaga nada do balde.
set -eu
case "${1:-}" in
  banco)
    arquivo=${2:?diga qual arquivo .dump}
    [ -f "$arquivo" ] || { echo "nao achei $arquivo"; exit 1; }
    pg_restore --clean --if-exists --no-owner --no-privileges -d "$PGDATABASE" "$arquivo"
    echo "banco restaurado de $arquivo"
    ;;
  midia)
    mc alias set destino http://midia:9000 "$MIDIA_USUARIO" "$MIDIA_SENHA" >/dev/null
    mc mirror --quiet "/copias/midia/$MIDIA_BALDE" "destino/$MIDIA_BALDE"
    echo "midia devolvida ao balde $MIDIA_BALDE"
    ;;
  *)
    echo "uso: restaurar.sh banco <arquivo.dump> | restaurar.sh midia"; exit 1 ;;
esac
