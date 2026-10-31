#!/bin/sh
# Uma rodada de copia: o banco inteiro (pg_dump, formato do pg_restore) e os anexos (o balde
# espelhado em arquivos comuns). Guarda as ultimas $MANTER copias do banco; o espelho dos
# anexos so acrescenta e atualiza, nunca apaga (anexo apagado por engano ainda esta la).
#
# Roda sozinho pelo agendar.sh, ou na mao:
#   docker exec $(docker ps -q -f name=relatofacil-dados_copias) /copias-scripts/copiar.sh
set -eu
: "${PGHOST:?}" "${PGUSER:?}" "${PGPASSWORD:?}" "${PGDATABASE:?}"
: "${MIDIA_USUARIO:?}" "${MIDIA_SENHA:?}" "${MIDIA_BALDE:?}"
MANTER=${MANTER:-14}
agora=$(date +%Y%m%d-%H%M)
mkdir -p /copias/banco /copias/midia

# O banco: primeiro num arquivo provisorio, e so renomeado se o pg_dump terminou bem. Copia
# pela metade nunca fica com cara de copia boa.
destino=/copias/banco/relatofacil-$agora.dump
pg_dump -Fc --no-owner --no-privileges -f "$destino.parcial"
mv "$destino.parcial" "$destino"
echo "banco: $(du -h "$destino" | cut -f1) em $destino"
ls -1t /copias/banco/*.dump | tail -n +$((MANTER + 1)) | xargs -r rm -f

# Os anexos.
mc alias set origem http://midia:9000 "$MIDIA_USUARIO" "$MIDIA_SENHA" >/dev/null
mc mirror --overwrite --quiet "origem/$MIDIA_BALDE" "/copias/midia/$MIDIA_BALDE"
echo "midia: $(du -sh /copias/midia | cut -f1) em /copias/midia"

date -Iseconds > /copias/ultima-copia
