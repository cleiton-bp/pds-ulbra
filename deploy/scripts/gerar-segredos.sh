#!/usr/bin/env bash
# Preenche o que estiver vazio num .env, sem mostrar nada, e deixa o arquivo legivel so pelo
# dono. O que ja esta preenchido nao muda: rodar de novo e seguro.
#
#   deploy/scripts/gerar-segredos.sh deploy/.env.producao
#
# Sorteia as senhas (o administrador e a aplicacao no banco, a fila, os tres usuarios da
# midia e a chave de assinatura) e tambem os nomes de usuario: o administrador do MinIO, que
# atende no endereco publico da midia, a API, as copias e a fila. O repositorio e publico, e
# quem le nao fica sabendo nem metade de um login.
#
# So letras e numeros: as senhas entram em URL (amqp://) e na conexao do banco, onde
# "/", "+", "=" e ";" quebrariam.
set -euo pipefail
arquivo=${1:?diga qual arquivo .env}
[ -f "$arquivo" ] || { echo "nao achei $arquivo"; exit 1; }

aleatorio() { openssl rand -base64 $(( $1 * 2 )) | tr -dc 'A-Za-z0-9' | head -c "$1"; }
# Nome de usuario: minusculas e numeros, com um prefixo que diz para que serve. O MinIO
# aceita ate 20 caracteres no nome.
nome() { echo "$1-$(openssl rand -base64 30 | tr -dc 'a-z0-9' | head -c 10)"; }

preencher() {
  local chave=$1 valor=$2 descricao=$3
  if grep -qE "^$chave=.+" "$arquivo"; then
    echo "$chave: ja preenchida, ficou como estava"
    return
  fi
  if grep -qE "^$chave=" "$arquivo"; then
    sed -i.bak "s|^$chave=.*|$chave=$valor|" "$arquivo" && rm -f "$arquivo.bak"
  else
    echo "$chave=$valor" >> "$arquivo"
  fi
  echo "$chave: $descricao"
}

preencher FILA_USUARIO "$(nome fila)" "nome sorteado"
preencher MIDIA_ADMIN_USUARIO "$(nome admin)" "nome sorteado"
preencher MIDIA_API_USUARIO "$(nome api)" "nome sorteado"
preencher MIDIA_COPIAS_USUARIO "$(nome copias)" "nome sorteado"
for chave in BANCO_ADMIN_SENHA BANCO_SENHA FILA_SENHA MIDIA_ADMIN_SENHA MIDIA_API_SENHA MIDIA_COPIAS_SENHA; do
  preencher "$chave" "$(aleatorio 32)" "gerada (32 caracteres)"
done
preencher JWT_SIGNING_KEY "$(aleatorio 64)" "gerada (64 caracteres)"
chmod 600 "$arquivo"
