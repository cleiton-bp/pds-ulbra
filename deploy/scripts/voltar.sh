#!/usr/bin/env bash
# Volta a aplicacao para a versao anterior, servico por servico. O Swarm guarda a anterior
# de cada um; a troca e sem parar, como no deploy.
#
#   deploy/scripts/voltar.sh            # a API, o painel e o editor
#   deploy/scripts/voltar.sh api        # so um
#
# O banco nao volta: a migracao do deploy fica. Por isso toda migracao precisa aceitar a
# versao anterior da API (secao 8, item 3, do estudo de hospedagem).
set -euo pipefail
servicos=("$@")
[ ${#servicos[@]} -eq 0 ] && servicos=(api painel editor)
for servico in "${servicos[@]}"; do
  echo "== relatofacil_$servico"
  docker service rollback "relatofacil_$servico"
done
docker service ls --filter label=com.docker.stack.namespace=relatofacil --format '{{.Name}}  {{.Replicas}}  {{.Image}}'
