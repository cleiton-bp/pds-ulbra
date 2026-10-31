#!/usr/bin/env bash
# Manda as copias de seguranca para fora da maquina: copia que mora so no disco dela some
# junto com ela. Usa o rclone (num conteiner), que fala com Google Drive, OneDrive, S3 e
# outros.
#
# As copias tem dados pessoais (nomes, e-mails, relatos), entao so saem cifradas: o destino
# tem de ser um remoto "crypt" do rclone, por cima do servico de verdade. Quem abrir a pasta
# no Drive ve so nomes e conteudo embaralhados. Destino de outro tipo e recusado.
#
# Configurar uma vez, no servidor (deploy/README.md, "Copias para fora da maquina"):
#
#   sudo docker run --rm -it -v /root/.config/rclone:/config/rclone rclone/rclone:1.71 config
#
# e depois todo dia, pelo cron do servidor:
#
#   deploy/scripts/enviar-copias.sh <remoto cifrado>:      # ex.: copias:
set -euo pipefail
destino=${1:?diga o destino cifrado do rclone, ex.: copias:}
remoto=${destino%%:*}
volume=relatofacil-dados_copias
CONFIG=${RCLONE_CONFIG_DIR:-/root/.config/rclone}
rclone() { docker run --rm -v "$CONFIG":/config/rclone:ro -v "$volume":/copias:ro rclone/rclone:1.71 "$@"; }

docker volume inspect "$volume" >/dev/null || { echo "o volume $volume nao existe"; exit 1; }
tipo=$(rclone config show "$remoto" 2>/dev/null | awk -F' = ' '$1 == "type" { print $2 }')
if [ "$tipo" != crypt ]; then
  echo "o remoto \"$remoto\" nao e cifrado (tipo: ${tipo:-nao achei}). As copias tem dados pessoais e" >&2
  echo "so saem por um remoto crypt do rclone: veja \"Copias para fora da maquina\" no deploy/README.md." >&2
  exit 1
fi

rclone copy /copias "$destino" --transfers 4 --log-level NOTICE
echo "copias enviadas, cifradas, para $destino em $(date -Iseconds)"
