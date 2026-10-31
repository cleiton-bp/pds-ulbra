# As copias de seguranca, dentro da maquina: o banco (pg_dump, da mesma versao do servidor) e
# os anexos (mc mirror, do MinIO). Uma vez por dia, na hora marcada. Mandar as copias para
# fora da maquina e o passo do enviar-copias.sh, no servidor (ver deploy/README.md).
#
# Contexto: a raiz do repositorio (o copias.Dockerfile.dockerignore deixa entrar so deploy/copias/).
FROM pgsty/minio:RELEASE.2026-08-04T00-00-00Z AS minio

FROM postgres:17.11-alpine
COPY --from=minio /usr/bin/mcli /usr/local/bin/mc
COPY deploy/copias/ /copias-scripts/
RUN chmod +x /copias-scripts/*.sh
ENTRYPOINT ["/copias-scripts/agendar.sh"]
