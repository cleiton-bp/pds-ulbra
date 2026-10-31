# O editor de modelagem e casos de uso, publicado so para leitura: apresenta como o projeto
# foi desenhado, sem nada que grave (ver tools/editor/src/shared/readOnly.ts). Os .yaml
# viram arquivos estaticos na montagem (scripts/exportar-leitura.mjs), e um Caddy so dele
# os serve no lugar da API de arquivos do Vite.
#
# Contexto: a raiz do repositorio (o editor.Dockerfile.dockerignore deixa entrar so
# tools/editor/ e deploy/editor/).
FROM --platform=$BUILDPLATFORM node:22.23.4-alpine AS build
WORKDIR /src
COPY tools/editor/package.json tools/editor/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tools/editor/ ./
ENV VITE_SOMENTE_LEITURA=1
RUN npx vite build && node scripts/exportar-leitura.mjs dist

FROM caddy:2.11.7-alpine
# O sistema da imagem atualizado na montagem: a base publicada pode vir com pacotes que ja
# tem correcao (em 30/10, o brotli e o curl). O binario da Caddy so muda com versao nova dela.
RUN apk upgrade --no-cache
COPY --from=build /src/dist /srv/editor
COPY deploy/editor/Caddyfile /etc/caddy/Caddyfile
