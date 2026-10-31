# O painel, no build de producao, servido por um Caddy so dele atras da borda. A mesma
# imagem guarda a montagem inteira (/srv/web), e dela sai tambem o pacote da CDN
# (scripts/montar-quadro.sh): o quadro que vai para a CDN e o painel que vai para a
# maquina sao a mesma montagem, nunca duas.
#
# Contexto: a raiz do repositorio (o painel.Dockerfile.dockerignore deixa entrar so web/ e
# deploy/painel/). Os enderecos entram na montagem: o Vite os grava no codigo.
FROM --platform=$BUILDPLATFORM node:22.23.4-alpine AS build
WORKDIR /src
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
ARG VITE_API_URL
ARG VITE_LOADER_URL
ARG VITE_GOOGLE_CLIENT_ID
RUN test -n "$VITE_API_URL" -a -n "$VITE_LOADER_URL" -a -n "$VITE_GOOGLE_CLIENT_ID" \
    || { echo "faltam VITE_API_URL, VITE_LOADER_URL ou VITE_GOOGLE_CLIENT_ID"; exit 1; }
RUN npm run build

FROM caddy:2.11.7-alpine
# O sistema da imagem atualizado na montagem: a base publicada pode vir com pacotes que ja
# tem correcao (em 30/10, o brotli e o curl). O binario da Caddy so muda com versao nova dela.
RUN apk upgrade --no-cache
COPY --from=build /src/dist /srv/web
COPY deploy/painel/ /etc/caddy/
RUN chmod +x /etc/caddy/iniciar.sh
ENTRYPOINT ["/etc/caddy/iniciar.sh"]
