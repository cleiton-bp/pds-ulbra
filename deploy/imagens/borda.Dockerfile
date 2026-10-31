# A borda: o unico conteiner com porta aberta para a internet. Termina o HTTPS (certificado
# do Let's Encrypt, renovado sozinho) e entrega cada endereco ao servico dele. Os enderecos
# vem do ambiente (ver deploy/borda/Caddyfile).
#
# Contexto: a raiz do repositorio (o borda.Dockerfile.dockerignore deixa entrar so deploy/borda/).
FROM caddy:2.11.7-alpine
# O sistema da imagem atualizado na montagem: a base publicada pode vir com pacotes que ja
# tem correcao (em 30/10, o brotli e o curl). O binario da Caddy so muda com versao nova dela.
RUN apk upgrade --no-cache
COPY deploy/borda/ /etc/caddy/
