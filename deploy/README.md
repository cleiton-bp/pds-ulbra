# Deploy do Relato Fácil

Tudo o que sobe para a máquina, em contêineres, orquestrado pelo Docker Swarm de um nó só:
a borda com HTTPS, o painel, a API, o editor de modelagem, o banco, a fila, a mídia e as
cópias de segurança. Fora da máquina fica só a CDN, que serve o que roda nos sites dos clientes.

A máquina: Hostinger KVM 2 (2 vCPU, 8 GB, 100 GB NVMe), em São Paulo, com Ubuntu 24.04 LTS.

## O que vai para onde

| Peça | Onde | Endereço |
|---|---|---|
| Borda (Caddy): HTTPS do Let's Encrypt, renovado sozinho | máquina | portas 80 e 443 |
| Painel: onde o time configura e trabalha | máquina | `painel.relatofacil.com` |
| API, com os workers, o tempo real e a documentação | máquina | `api.relatofacil.com` |
| Mídia (MinIO): os anexos | máquina | `midia.relatofacil.com` |
| Editor de modelagem e casos de uso, só leitura | máquina | `editor.relatofacil.com` |
| Banco (PostgreSQL 17), fila (RabbitMQ) e cópias | máquina | só a rede interna |
| Carregador, quadro e página de acompanhamento | CDN (Cloudflare Pages) | `quadro.relatofacil.com` |
| Domínio puro e `www` | máquina | levam ao painel |

O painel e o quadro ficam em origens separadas de propósito: o quadro roda dentro dos sites dos
clientes, e um XSS nele não alcança a sessão do time, que mora na origem do painel. Por isso a
origem do painel responde 404 para o carregador, o quadro e a página de acompanhamento.

## Os arquivos

| Arquivo | O que é |
|---|---|
| `stack-dados.yml` | Banco, fila, mídia e cópias: o que guarda estado. Muda pouco, e nunca roda duas cópias ao mesmo tempo |
| `stack-app.yml` | Borda, painel, editor e API: o que muda a cada deploy. A versão nova sobe ao lado da antiga e só a troca depois de responder; se não responder, volta sozinha |
| `imagens/` | Como cada imagem é montada |
| `borda/`, `painel/`, `editor/` | A configuração de cada Caddy |
| `copias/` | A cópia diária e a restauração |
| `midia/` | As políticas dos usuários do MinIO e a expiração dos envios não confirmados |
| `quadro/_headers` | Os cabeçalhos do quadro na CDN |
| `scripts/` | Implantar, voltar, segredos, pacote da CDN e cópias para fora |
| `servidor/preparar.sh` | O preparo da máquina nova, uma vez |
| `env.producao.exemplo` | Os **nomes** das variáveis, sem nenhum valor (o repositório é público). Os valores ficam só na máquina, em `.env.producao`, fora do git |

## A memória da máquina

| Serviço | Limite | Uso típico |
|---|---|---|
| Banco | 2 GB | 0,5 a 1 GB |
| API | 1 GB (2 por alguns segundos no deploy) | 250 a 500 MB |
| Fila | 768 MB | 150 MB |
| Mídia | 512 MB | 100 a 200 MB |
| Borda, painel, editor, cópias | 256, 128, 128 e 256 MB | 20 a 150 MB cada |

Somados, os limites ficam em cerca de 6 GB dos 8 GB, e o uso típico em menos de 2,5 GB. A folga
cobre a montagem das imagens, que acontece na própria máquina, e o swap de 2 GB é só a rede de
segurança.

## Antes do primeiro deploy

1. **DNS, no painel da Hostinger** (troque `<ip>` pelo IP da máquina):

   | Tipo | Nome | Valor |
   |---|---|---|
   | A | `@` | `<ip>` |
   | A | `www` | `<ip>` |
   | A | `painel` | `<ip>` |
   | A | `api` | `<ip>` |
   | A | `midia` | `<ip>` |
   | A | `editor` | `<ip>` |
   | CNAME | `quadro` | `<projeto>.pages.dev` (passo 4) |

   O certificado só sai depois que esses nomes apontarem para a máquina.

2. **Google**: no client id do login, em "Origens JavaScript autorizadas", acrescente
   `https://painel.relatofacil.com`. Só o painel entra com o Google.

3. **Brevo**: autentique o domínio `relatofacil.com` (o Brevo mostra os registros, que vão no
   mesmo DNS da Hostinger) e crie uma chave SMTP. O usuário e a chave vão para `SMTP_USUARIO`
   e `SMTP_SENHA`.

4. **Cloudflare Pages**: crie um projeto (por exemplo, `relatofacil-quadro`) e, em "Custom
   domains", acrescente `quadro.relatofacil.com`. O Pages mostra o CNAME do passo 1.

## As variáveis

**O repositório é público, então nenhum valor de variável fica nele.** O `env.producao.exemplo`
tem só os nomes; os valores existem na máquina (`deploy/.env.producao`, legível só pelo dono) e
com quem cuida do deploy. Se faltar algum valor, o `implantar.sh` para antes de começar e diz
quais faltam.

| De onde vem o valor | Variáveis |
|---|---|
| **Pedir ao time** | `PAINEL_URL`, `API_URL`, `MIDIA_URL`, `EDITOR_URL`, `QUADRO_URL`, `RAIZ_ENDERECO`, `ACME_EMAIL`, `GOOGLE_CLIENT_ID`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SEGURANCA`, `SMTP_USUARIO`, `SMTP_SENHA`, `SMTP_REMETENTE`, `SMTP_NOME` |
| **Sorteado na máquina** pelo `gerar-segredos.sh`, e nunca sai dela | as senhas do banco, da fila e dos três usuários da mídia, os nomes de usuário da fila e da mídia, e a `JWT_SIGNING_KEY` |

Guarde uma cópia do `.env.producao` num gerenciador de senhas do time, nunca no git nem num
documento compartilhado em texto aberto.

## Primeiro deploy

```bash
# na sua máquina: prepara a VPS nova (uma vez)
scp deploy/servidor/preparar.sh root@<ip>:/root/
ssh root@<ip> bash /root/preparar.sh

# na VPS, como deploy
ssh deploy@<ip>
git clone <endereço do repositório> relatofacil && cd relatofacil
cp deploy/env.producao.exemplo deploy/.env.producao
deploy/scripts/gerar-segredos.sh deploy/.env.producao
nano deploy/.env.producao          # os valores que vêm do time (abaixo)
deploy/scripts/implantar.sh
```

O `implantar.sh` faz, em ordem: monta as sete imagens, cria as redes, sobe os dados e espera
cada um ficar saudável, cria o usuário da aplicação no banco, prepara o balde e os usuários da
mídia, roda a migração, sobe a aplicação, espera a troca terminar e confere cada endereço pela
própria máquina. Se algum passo falhar, ele para e diz qual.

**Cada parte entra com o mínimo de poder.** A API, a migração e as cópias usam o usuário
`relatofacil` do banco, comum e dono só do banco dele; o superusuário `postgres` fica para
manutenção. No MinIO, a API só lê, grava e apaga arquivos do balde, as cópias só listam, leem e
devolvem, e o administrador só aparece no passo que prepara o balde (`deploy/midia/`).

Depois, o pacote da CDN:

```bash
deploy/scripts/montar-quadro.sh
npx wrangler pages deploy deploy/saida/quadro --project-name relatofacil-quadro
```

O pacote sai da mesma imagem do painel que está no ar, então o quadro e o painel são sempre a
mesma montagem. Sem o `wrangler`, dá para subir a pasta `deploy/saida/quadro` pelo painel do
Cloudflare.

## Atualizar

```bash
cd relatofacil && git pull
deploy/scripts/implantar.sh
deploy/scripts/montar-quadro.sh && npx wrangler pages deploy deploy/saida/quadro --project-name relatofacil-quadro
```

Cada imagem leva a etiqueta do próprio conteúdo, então só reinicia o serviço que mudou. A API
nova sobe ao lado da antiga e só a substitui depois de responder; quem está usando não percebe.
A borda é a exceção: dois Caddy não abrem a mesma porta, então trocar a borda derruba o acesso
por alguns segundos. Ela só muda quando `deploy/borda/` muda.

**Toda migração precisa aceitar a versão anterior da API**, que roda junto por alguns segundos
no deploy e de novo se for preciso voltar. Renomear ou apagar coluna vira dois deploys:
acrescenta, migra os dados, e só no seguinte remove.

**Uma vez por mês, atualize as bases das imagens:**

```bash
ATUALIZAR_BASES=1 deploy/scripts/implantar.sh
```

Ele baixa as imagens de base de novo e refaz cada camada sem cache, e é assim que as correções de
segurança do sistema das imagens chegam à máquina. No deploy do dia a dia o cache vale, e essas
correções ficam paradas na última montagem.

## Voltar

```bash
deploy/scripts/voltar.sh            # API, painel e editor voltam para a versão anterior
deploy/scripts/voltar.sh api        # só a API
```

O banco não volta: a migração fica. Se o deploy falhar sozinho (a API nova não respondeu), o
Swarm já volta sem ninguém pedir, e o `implantar.sh` avisa.

## Cópias de segurança

O serviço `copias` guarda, todo dia às 3h de Brasília, o banco inteiro (as últimas 14 cópias) e
o espelho dos anexos, no volume `relatofacil-dados_copias`.

```bash
# uma cópia agora
docker exec $(docker ps -q -f name=relatofacil-dados_copias) /copias-scripts/copiar.sh

# restaurar o banco: pare a API, restaure, volte a API
docker service scale relatofacil_api=0
docker exec -it $(docker ps -q -f name=relatofacil-dados_copias) \
  /copias-scripts/restaurar.sh banco /copias/banco/relatofacil-AAAAMMDD-HHMM.dump
docker service scale relatofacil_api=1

# devolver ao balde os anexos do espelho
docker exec -it $(docker ps -q -f name=relatofacil-dados_copias) /copias-scripts/restaurar.sh midia
```

### Cópias para fora da máquina

**Cópia que só existe na máquina some junto com ela.** E, como as cópias têm dados pessoais
(nomes, e-mails e relatos), elas **só saem cifradas**: o `enviar-copias.sh` recusa qualquer
destino que não seja um remoto `crypt` do rclone.

1. Abra a configuração do rclone no servidor:

   ```bash
   sudo docker run --rm -it -v /root/.config/rclone:/config/rclone rclone/rclone:1.71 config
   ```

2. Crie o remoto do serviço, por exemplo `drive` (Google Drive), como o rclone pedir.
3. Crie um segundo remoto, `copias`, do tipo **crypt**, apontando para `drive:relatofacil-copias`,
   com a cifra de nomes ligada e as duas senhas geradas pelo próprio rclone.
4. **Guarde as duas senhas do `crypt` num gerenciador de senhas, fora do Drive.** Sem elas, as
   cópias não abrem nunca mais, nem para vocês.
5. Teste e agende:

   ```bash
   sudo deploy/scripts/enviar-copias.sh copias:
   sudo crontab -e    # 30 4 * * * /home/deploy/relatofacil/deploy/scripts/enviar-copias.sh copias:
   ```

Para trazer de volta: `rclone copy copias: <pasta>`, com a mesma configuração, devolve os
arquivos já decifrados.

## As contas que controlam o ar

Quem entrar numa destas contas derruba o sistema, ou pior, publica código nos sites de todos os
clientes pelo carregador. Em todas: **verificação em duas etapas ligada** e acesso só para quem
precisa.

| Conta | Por quê |
|---|---|
| Hostinger | A máquina inteira, o DNS e os snapshots |
| GitHub | O código que vai para a máquina |
| Cloudflare | O carregador e o quadro, que rodam nos sites dos clientes |
| Google Cloud | O login do painel |
| Brevo | Os e-mails que saem em nome do domínio |
| A do rclone (Google Drive) | As cópias, mesmo cifradas |

E a chave SSH de quem faz deploy com senha: `ssh-keygen -p -f ~/.ssh/<chave>` acrescenta uma
sem trocar a chave.

## Ver o que está acontecendo

```bash
docker service ls                                  # cada serviço e quantas réplicas estão de pé
docker service ps relatofacil_api --no-trunc       # o histórico de tarefas, com o erro de cada uma
docker service logs -f --since 10m relatofacil_api # os registros (em JSON, uma linha por evento)
docker stats --no-stream                           # memória e CPU de cada contêiner
```

Vale também um vigia de fora (UptimeRobot, gratuito) chamando `https://api.relatofacil.com/health/ready`
e `https://quadro.relatofacil.com/v1/pds.js` a cada minuto: vigiar de dentro não avisa quando a
máquina inteira cai.

## O que fica para depois

- **Duas réplicas da API**: os avisos em tempo real e os limites por IP precisam de mudanças
  antes (seção 8 do estudo de hospedagem).
- **CSP de script e estilo** no painel e no quadro: hoje só a de quem pode embutir.
- **Montar as imagens fora da máquina** (GitHub Actions e um registro), quando o deploy por
  `git pull` ficar lento.
