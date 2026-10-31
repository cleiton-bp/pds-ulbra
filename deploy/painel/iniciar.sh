#!/bin/sh
# Sobe o Caddy do painel. Antes, guarda os pedacos desta versao no volume de pedacos: quem
# esta com o painel aberto durante um deploy ainda pede os pedacos da versao anterior, das
# telas que nao abriu, e sem eles cai na tela de erro. Os desta versao saem de /srv/web; os
# de antes, do volume. O que nenhuma versao usa ha 30 dias sai do volume.
set -eu

if [ -d /srv/pedacos ]; then
  cp -a /srv/web/assets/. /srv/pedacos/
  for arquivo in /srv/web/assets/*; do touch "/srv/pedacos/${arquivo##*/}"; done
  find /srv/pedacos -type f -mtime +30 -delete
fi

exec caddy run --config /etc/caddy/painel.caddy --adapter caddyfile
