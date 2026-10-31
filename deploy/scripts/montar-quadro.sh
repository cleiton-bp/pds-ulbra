#!/usr/bin/env bash
# Monta o pacote da CDN (Cloudflare Pages): o carregador, o quadro, a pagina de
# acompanhamento e os pedacos, tirados da mesma imagem do painel que esta no ar. Assim o
# quadro e o painel sao sempre a mesma montagem.
#
#   deploy/scripts/montar-quadro.sh                  # pacote em deploy/saida/quadro
#   npx wrangler@4.151.1 pages deploy deploy/saida/quadro --project-name relatofacil-quadro
#
# Os pedacos de antes nao saem do pacote: quem esta com um quadro aberto num site de
# cliente durante a troca ainda pede os da versao anterior.
set -euo pipefail
RAIZ=$(cd "$(dirname "$0")/../.." && pwd)
SAIDA=$RAIZ/deploy/saida/quadro
# Os enderecos da politica de conteudo (deploy/quadro/_headers) saem do mesmo .env do deploy.
ENV_ARQ=${ENV_ARQ:-$RAIZ/deploy/.env.producao}
[ -f "$ENV_ARQ" ] || { echo "falta $ENV_ARQ"; exit 1; }
set -a
# shellcheck disable=SC1090
. "$ENV_ARQ"
set +a
imagem=$(docker service inspect relatofacil_painel --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}' 2>/dev/null || true)
imagem=${imagem%@*}
[ -n "$imagem" ] || { echo "o painel nao esta no ar nesta maquina (rode o implantar.sh antes)"; exit 1; }

temporario=$(mktemp -d)
trap 'rm -rf "$temporario"; docker rm -f relatofacil-quadro-pacote >/dev/null 2>&1 || true' EXIT
docker create --name relatofacil-quadro-pacote "$imagem" >/dev/null
docker cp relatofacil-quadro-pacote:/srv/web/. "$temporario/"

mkdir -p "$SAIDA/assets" "$SAIDA/v1"
cp "$temporario/embed.html" "$temporario/tracking.html" "$temporario/favicon.svg" "$temporario/tema-acompanhamento.js" \
  "$temporario/teste-do-botao.html" "$temporario/teste-do-botao.js" "$SAIDA/"
cp -a "$temporario/v1/." "$SAIDA/v1/"
cp -a "$temporario/assets/." "$SAIDA/assets/"
sed -e "s|__API_URL__|$API_URL|g" -e "s|__MIDIA_URL__|$MIDIA_URL|g" "$RAIZ/deploy/quadro/_headers" > "$SAIDA/_headers"
! grep -q "__[A-Z_]*__" "$SAIDA/_headers" || { echo "sobrou marcador sem valor em $SAIDA/_headers"; exit 1; }
echo "pacote da CDN em $SAIDA, da imagem $imagem ($(du -sh "$SAIDA" | cut -f1))"
