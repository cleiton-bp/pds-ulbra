#!/usr/bin/env bash
# Monta as imagens, sobe os dados, migra o banco e sobe a aplicacao. Roda na maquina, de
# qualquer pasta:
#
#   deploy/scripts/implantar.sh                      # usa deploy/.env.producao
#   deploy/scripts/implantar.sh caminho/do/.env      # outro arquivo de configuracao
#   ATUALIZAR_BASES=1 deploy/scripts/implantar.sh    # uma vez por mes: bases e pacotes novos
#
# Rodar de novo sem mudar nada nao derruba nada: cada imagem leva a etiqueta do proprio
# conteudo, e o Swarm so troca o servico cuja imagem mudou. A API nova so substitui a
# antiga depois de responder na sonda; se nao responder, volta sozinha (stack-app.yml).
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/../.." && pwd)
ENV_ARQ=${1:-$RAIZ/deploy/.env.producao}
[ -f "$ENV_ARQ" ] || { echo "falta $ENV_ARQ: copie deploy/env.producao.exemplo e rode gerar-segredos.sh"; exit 1; }
set -a
# shellcheck disable=SC1090
. "$ENV_ARQ"
set +a

# Antes de qualquer coisa: todo nome do modelo (deploy/env.producao.exemplo) com valor. Os
# valores nao estao no repositorio, que e publico; faltando algum, para aqui e diz qual.
# Usuario e senha do SMTP podem ficar vazios (um servidor sem login).
faltam=()
for nome in $(grep -oE '^[A-Z][A-Z0-9_]*=' "$RAIZ/deploy/env.producao.exemplo" | tr -d '='); do
  case $nome in SMTP_USUARIO|SMTP_SENHA) continue ;; esac
  [ -n "${!nome:-}" ] || faltam+=("$nome")
done
if [ ${#faltam[@]} -gt 0 ]; then
  printf '\n!! faltam valores em %s:\n' "$ENV_ARQ" >&2
  printf '   %s\n' "${faltam[@]}" >&2
  echo "   Os sorteados saem do gerar-segredos.sh; os outros, peca ao time." >&2
  exit 1
fi
# Opcional: um arquivo a mais por cima da pilha da aplicacao (docker stack deploy -c).
EXTRA_APP=${STACK_APP_EXTRA:-}

passo() { printf '\n== %s\n' "$*"; }
falha() { printf '\n!! %s\n' "$*" >&2; exit 1; }

# Monta e devolve a etiqueta pelo conteudo: os 12 primeiros caracteres do id da imagem.
# Mesmo codigo, mesma etiqueta; o Swarm nao reinicia o que nao mudou.
#
# Com ATUALIZAR_BASES=1, baixa as bases de novo e refaz cada camada, sem cache: e assim que
# as correcoes de seguranca do sistema das imagens (o apk upgrade e o apt-get upgrade dos
# Dockerfiles) chegam a maquina. Sem ela, o cache guarda a camada da ultima montagem.
montar() {
  local nome=$1; shift
  local id extra=()
  [ "${ATUALIZAR_BASES:-}" = 1 ] && extra=(--pull --no-cache)
  id=$(docker build -q "${extra[@]}" "$@") || falha "a imagem $nome nao montou (rode de novo sem -q para ver o erro: docker build $*)"
  id=${id#sha256:}
  docker tag "$id" "relatofacil/$nome:${id:0:12}"
  echo "${id:0:12}"
}

# Espera o servico terminar de subir na imagem que ele tem de rodar agora: a tarefa de pe
# nessa imagem e um conteiner dela saudavel. So "algum conteiner saudavel" nao basta: numa
# troca, o saudavel ainda pode ser o antigo, a um passo de sair, e o passo seguinte do deploy
# encontraria o servico fora (assim a API nova ja subiu com a fila ainda reiniciando).
esperar_saudavel() {
  local servico=$1 limite=${2:-180} inicio=$SECONDS imagem
  imagem=$(docker service inspect "$servico" --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'); imagem=${imagem%@*}
  until ! docker service ps "$servico" -f desired-state=running --format '{{.Image}}' | sed 's/@.*//' | grep -qv -x -F "$imagem" \
        && [ -n "$(docker ps -q -f "name=${servico}\." -f "ancestor=$imagem" -f health=healthy | head -1)" ]; do
    (( SECONDS - inicio > limite )) && falha "$servico nao ficou saudavel em ${limite}s (docker service ps $servico --no-trunc)"
    sleep 3
  done
  echo "$servico: saudavel em $imagem"
}

passo "1. Imagens"
TAG_API=$(montar api "$RAIZ/api")
TAG_MIGRACAO=$(montar migracao -f "$RAIZ/deploy/imagens/migracao.Dockerfile" "$RAIZ/api")
TAG_FILA=$(montar fila "$RAIZ/api/rabbitmq")
TAG_PAINEL=$(montar painel -f "$RAIZ/deploy/imagens/painel.Dockerfile" \
  --build-arg "VITE_API_URL=$API_URL" \
  --build-arg "VITE_LOADER_URL=$QUADRO_URL/v1/pds.js" \
  --build-arg "VITE_GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID" "$RAIZ")
TAG_EDITOR=$(montar editor -f "$RAIZ/deploy/imagens/editor.Dockerfile" "$RAIZ")
TAG_BORDA=$(montar borda -f "$RAIZ/deploy/imagens/borda.Dockerfile" "$RAIZ")
TAG_COPIAS=$(montar copias -f "$RAIZ/deploy/imagens/copias.Dockerfile" "$RAIZ")
export TAG_API TAG_MIGRACAO TAG_FILA TAG_PAINEL TAG_EDITOR TAG_BORDA TAG_COPIAS
printf '%s\n' "api $TAG_API" "migracao $TAG_MIGRACAO" "fila $TAG_FILA" "painel $TAG_PAINEL" \
  "editor $TAG_EDITOR" "borda $TAG_BORDA" "copias $TAG_COPIAS"

passo "2. Redes"
# Faixas fixas: a API confia so na da borda (TRUSTED_PROXIES no stack-app.yml).
docker network inspect relatofacil-borda >/dev/null 2>&1 \
  || docker network create --driver overlay --attachable --subnet 10.77.1.0/24 relatofacil-borda
docker network inspect relatofacil-dados >/dev/null 2>&1 \
  || docker network create --driver overlay --attachable --internal --subnet 10.77.2.0/24 relatofacil-dados

passo "3. Dados"
docker stack deploy --resolve-image never -c "$RAIZ/deploy/stack-dados.yml" relatofacil-dados
esperar_saudavel relatofacil-dados_banco
esperar_saudavel relatofacil-dados_fila 240
esperar_saudavel relatofacil-dados_midia

passo "4. Usuario da aplicacao no banco"
# A API, a migracao e as copias entram com um usuario comum, dono do banco, e nunca com o
# superusuario: se um dia houver injecao de SQL, o comum nao executa comando no conteiner do
# banco nem alcanca outro banco. O superusuario (postgres) fica so para manutencao.
# Idempotente: cria na primeira vez e, nas outras, so confere o poder e a senha.
docker run --rm -i --network relatofacil-dados \
  -e "PGPASSWORD=$BANCO_ADMIN_SENHA" -e "SENHA_APP=$BANCO_SENHA" \
  postgres:17.11-alpine sh -c 'psql -X -q -v ON_ERROR_STOP=1 -h banco -U postgres -d relatofacil -v senha="$SENHA_APP"' <<'SQL' \
  || falha "nao consegui preparar o usuario da aplicacao no banco"
SELECT 'CREATE ROLE relatofacil LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'relatofacil') \gexec
ALTER ROLE relatofacil WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'senha';
ALTER DATABASE relatofacil OWNER TO relatofacil;
ALTER SCHEMA public OWNER TO relatofacil;
SQL
echo "relatofacil: usuario comum, dono do banco"

passo "5. Balde e usuarios da midia"
# Com o administrador do MinIO, e so aqui: o balde privado, os envios nao confirmados
# (uploads/) sumindo em 1 dia, e um usuario para a API e outro para as copias, cada um com o
# minimo (deploy/midia/). Idempotente.
docker run --rm --network relatofacil-dados -v "$RAIZ/deploy/midia:/midia:ro" \
  -e "ADMIN_USUARIO=$MIDIA_ADMIN_USUARIO" -e "ADMIN_SENHA=$MIDIA_ADMIN_SENHA" \
  -e "API_USUARIO=$MIDIA_API_USUARIO" -e "API_SENHA=$MIDIA_API_SENHA" \
  -e "COPIAS_USUARIO=$MIDIA_COPIAS_USUARIO" -e "COPIAS_SENHA=$MIDIA_COPIAS_SENHA" \
  --entrypoint sh pgsty/minio:RELEASE.2026-08-04T00-00-00Z -c '
    set -eu
    mc alias set rf http://midia:9000 "$ADMIN_USUARIO" "$ADMIN_SENHA" >/dev/null
    mc mb --ignore-existing rf/relatofacil-midia
    mc anonymous set none rf/relatofacil-midia
    mc ilm import rf/relatofacil-midia < /midia/expiracao.json
    usuario() {
      mc admin policy create rf "$1" "$2" >/dev/null
      mc admin user add rf "$3" "$4" >/dev/null
      mc admin user info rf "$3" | grep -q "PolicyName: $1\$" || mc admin policy attach rf "$1" --user "$3" >/dev/null
      echo "$3: politica $1"
    }
    usuario relatofacil-api /midia/politica-api.json "$API_USUARIO" "$API_SENHA"
    usuario relatofacil-copias /midia/politica-copias.json "$COPIAS_USUARIO" "$COPIAS_SENHA"' \
  || falha "nao consegui preparar o balde e os usuarios da midia"

passo "6. Migracao"
# Antes da API nova: ela so sobe com o banco ja no formato dela. A migracao precisa aceitar
# a versao anterior rodando junto por alguns segundos (secao 8, item 3, do estudo).
docker run --rm --network relatofacil-dados \
  -e "DB_CONNECTION_STRING=Host=banco;Port=5432;Database=relatofacil;Username=relatofacil;Password=$BANCO_SENHA" \
  "relatofacil/migracao:$TAG_MIGRACAO"

passo "7. Aplicacao"
arquivos=(-c "$RAIZ/deploy/stack-app.yml")
[ -n "$EXTRA_APP" ] && arquivos+=(-c "$EXTRA_APP")
docker stack deploy --resolve-image never "${arquivos[@]}" relatofacil

# A imagem que cada servico da aplicacao tem de rodar agora.
esperada() {
  case $1 in
    relatofacil_api) echo "relatofacil/api:$TAG_API" ;;
    relatofacil_painel) echo "relatofacil/painel:$TAG_PAINEL" ;;
    relatofacil_editor) echo "relatofacil/editor:$TAG_EDITOR" ;;
    relatofacil_borda) echo "relatofacil/borda:$TAG_BORDA" ;;
  esac
}
# O stack deploy guarda num rotulo a imagem que ele pos e, quando o arquivo pede a mesma,
# mantem a que estiver de pe. Quem trocou a imagem na mao (docker service update) ficaria
# com ela. Aqui todo servico fica com a imagem desta montagem.
for servico in $(docker service ls --filter label=com.docker.stack.namespace=relatofacil --format '{{.Name}}'); do
  alvo=$(esperada "$servico")
  imagem=$(docker service inspect "$servico" --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'); imagem=${imagem%@*}
  if [ -n "$alvo" ] && [ "$imagem" != "$alvo" ]; then
    echo "$servico estava com $imagem: alinhando para $alvo"
    docker service update --detach --no-resolve-image --image "$alvo" "$servico" >/dev/null
  fi
done

passo "8. Esperando a troca"
# Cada servico da aplicacao: a troca terminada e todas as replicas de pe. Um que voltou
# sozinho para a versao anterior (a imagem de pe nao e a que acabou de ser montada) para o
# deploy aqui. O estado "voltou" de um deploy antigo nao conta: so a imagem de agora.
inicio=$SECONDS
while true; do
  em_troca=0
  for servico in $(docker service ls --filter label=com.docker.stack.namespace=relatofacil --format '{{.Name}}'); do
    estado=$(docker service inspect "$servico" --format '{{if .UpdateStatus}}{{.UpdateStatus.State}}{{else}}novo{{end}}')
    imagem=$(docker service inspect "$servico" --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'); imagem=${imagem%@*}
    alvo=$(esperada "$servico")
    case $estado in
      updating|rollback_started|paused|rollback_paused) em_troca=1 ;;
      *) if [ -n "$alvo" ] && [ "$imagem" != "$alvo" ]; then
           falha "$servico nao respondeu na versao nova e voltou para a anterior ($imagem): docker service ps $servico --no-trunc"
         fi ;;
    esac
    # A troca so acabou quando as tarefas de pe rodam a imagem nova: logo depois do pedido,
    # o Swarm ainda pode nao ter comecado, e o estado parece o de antes.
    if [ -n "$alvo" ] && docker service ps "$servico" -f desired-state=running --format '{{.Image}}' \
         | sed 's/@.*//' | grep -qv -x -F "$alvo"; then
      em_troca=1
    fi
  done
  pendentes=$(docker service ls --filter label=com.docker.stack.namespace=relatofacil --format '{{.Replicas}}' | awk -F/ '$1 != $2' | wc -l)
  if [ "$em_troca" -eq 0 ] && [ "$pendentes" -eq 0 ]; then
    esperar_saudavel relatofacil_api 120
    break
  fi
  (( SECONDS - inicio > 300 )) && falha "a pilha nao convergiu em 5 min: docker stack ps relatofacil"
  sleep 5
done

passo "9. Conferindo pela borda"
# Pela propria maquina, sem depender do DNS: o endereco publico resolvido para 127.0.0.1.
conferir() {
  local url=$1 esperado=${2:-200} host porta codigo
  host=$(echo "$url" | sed -E 's#^https?://([^/:]+).*#\1#')
  porta=$(echo "$url" | sed -nE 's#^https?://[^/:]+:([0-9]+).*#\1#p'); porta=${porta:-443}
  codigo=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 15 --resolve "$host:$porta:127.0.0.1" "$url" || true)
  [ "$codigo" = "$esperado" ] || falha "$url respondeu $codigo, e nao $esperado"
  echo "$url: $codigo"
}
conferir "$API_URL/health/ready"
conferir "$PAINEL_URL/"
conferir "$EDITOR_URL/api/modeling/files"
conferir "$PAINEL_URL/embed.html" 404

passo "Pronto"
docker service ls --filter label=com.docker.stack.namespace=relatofacil --format '{{.Name}}  {{.Replicas}}  {{.Image}}'
docker service ls --filter label=com.docker.stack.namespace=relatofacil-dados --format '{{.Name}}  {{.Replicas}}  {{.Image}}'
# Imagens sem uso ha mais de 30 dias saem; as em uso e as recentes ficam (voltar.sh precisa delas).
docker image prune -af --filter "until=720h" >/dev/null || true
