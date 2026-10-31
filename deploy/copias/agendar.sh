#!/bin/sh
# Espera a hora marcada ($HORA, no fuso $TZ) e roda o copiar.sh, todo dia. Rodada que falha
# aparece no log do servico e tenta de novo no dia seguinte; a anterior continua guardada.
set -eu
HORA=${HORA:-03:00}

while true; do
  agora=$(date +%s)
  alvo=$(date -d "$(date +%Y-%m-%d) $HORA" +%s 2>/dev/null || date -D '%Y-%m-%d %H:%M' -d "$(date +%Y-%m-%d) $HORA" +%s)
  [ "$alvo" -le "$agora" ] && alvo=$((alvo + 86400))
  echo "proxima copia em $(date -d "@$alvo" '+%d/%m %H:%M')"
  sleep $((alvo - agora))
  /copias-scripts/copiar.sh || echo "a copia falhou; a anterior continua guardada"
done
