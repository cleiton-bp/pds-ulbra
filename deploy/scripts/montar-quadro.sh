#!/usr/bin/env bash
# Monta o pacote da CDN (Cloudflare Pages): o carregador, o quadro, a pagina de
# acompanhamento e os pedacos, tirados da mesma imagem do painel que esta no ar. Assim o
# quadro e o painel sao sempre a mesma montagem.
#
#   deploy/scripts/montar-quadro.sh                  # pacote em deploy/saida/quadro
#   npx wrangler pages deploy deploy/saida/quadro --project-name relatofacil-quadro
#
# Os pedacos de antes nao saem do pacote: quem esta com um quadro aberto num site de
# cliente durante a troca ainda pede os da versao anterior.
set -euo pipefail
RAIZ=$(cd "$(dirname "$0")/../.." && pwd)
SAIDA=$RAIZ/deploy/saida/quadro
imagem=$(docker service inspect relatofacil_painel --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}' 2>/dev/null || true)
imagem=${imagem%@*}
[ -n "$imagem" ] || { echo "o painel nao esta no ar nesta maquina (rode o implantar.sh antes)"; exit 1; }

temporario=$(mktemp -d)
trap 'rm -rf "$temporario"; docker rm -f relatofacil-quadro-pacote >/dev/null 2>&1 || true' EXIT
docker create --name relatofacil-quadro-pacote "$imagem" >/dev/null
docker cp relatofacil-quadro-pacote:/srv/web/. "$temporario/"

mkdir -p "$SAIDA/assets" "$SAIDA/v1"
cp "$temporario/embed.html" "$temporario/tracking.html" "$temporario/favicon.svg" "$SAIDA/"
cp -a "$temporario/v1/." "$SAIDA/v1/"
cp -a "$temporario/assets/." "$SAIDA/assets/"
cp "$RAIZ/deploy/quadro/_headers" "$SAIDA/_headers"
echo "pacote da CDN em $SAIDA, da imagem $imagem ($(du -sh "$SAIDA" | cut -f1))"
