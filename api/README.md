# API

Backend da plataforma. C# no .NET 10, PostgreSQL, Entity Framework Core.

> **A documentação do projeto está dentro da própria aplicação.** Suba a API e abra
> `http://localhost:5080` — arquitetura, modelagem, autenticação, isolamento por
> conta, rotas e as decisões por trás de cada uma. O Swagger fica em `/swagger`.
>
> Este arquivo cobre só o que você precisa saber **antes** de conseguir rodar.

---

## Pré-requisitos

- **.NET 10 SDK**
- **dotnet-ef**, para as migrações:
  ```bash
  dotnet tool install --global dotnet-ef
  ```

Não precisa de banco local: o PostgreSQL é hospedado.

Docker é opcional, e serve para **duas** coisas, que rodam na sua máquina: a fila
que sustenta a espera antes de quem relatou ver, e o armazenamento dos anexos. Sem
elas a API sobe inteira: sem a fila, a espera fica indisponível — a tela de Ciclo
recusa ligá-la, dizendo por quê — e o pedido de informação não encerra sozinho no
prazo, fica aberto até quem relatou responder ou o time agir; sem o armazenamento, o anexo fica desligado — a
tela de Mídia recusa ligá-lo.

---

## Rodar

Todos os comandos rodam a partir da pasta `api`.

```bash
cd api

cp Pds.WebApi/Environment/.env.example Pds.WebApi/Environment/.env.local
# peça os valores a quem já roda o projeto (ver abaixo)

dotnet ef database update --project Pds.Data --startup-project Pds.WebApi
dotnet run --project Pds.WebApi
```

Sobe em **`http://localhost:5080`**.

---

## As variáveis

Ficam em `Pds.WebApi/Environment/.env.local`, que **não vai para o repositório**.
Em produção, vêm das variáveis reais do ambiente.

> **Peça o `.env.local` a quem já está no projeto.** Não tente montar o seu: o banco
> é compartilhado pelo grupo e a aplicação no Google está registrada uma vez só —
> inventar valores não faz a API subir.
>
> Quem envia deve usar canal privado: mensagem direta ou gerenciador de senhas.
> Nunca por commit, issue, pull request ou grupo.

| Variável | Obrigatória | Para quê |
|---|---|---|
| `DB_CONNECTION_STRING` | sim | Conexão com o PostgreSQL. **Precisa pedir** |
| `JWT_SIGNING_KEY` | sim | Assinatura do token de sessão. **Esta você mesmo gera** |
| `GOOGLE_CLIENT_ID` | no login | ID do cliente OAuth. **Precisa pedir** |
| `JWT_ISSUER` / `JWT_AUDIENCE` | não | Emissor e destinatário. Padrão `pds` e `pds.panel` |
| `JWT_EXPIRATION_HOURS` | não | Validade da sessão. Padrão 8 |
| `CORS_ALLOWED_ORIGINS` | não | Origens do painel, separadas por vírgula |
| `RABBITMQ_URL` | não | A fila da espera e dos prazos do pedido. Ausente, a espera fica indisponível e o pedido não encerra sozinho |
| `MEDIA_STORAGE_ENDPOINT` / `_ACCESS_KEY` / `_SECRET_KEY` / `_BUCKET` | não | O armazenamento dos anexos. **As quatro, ou nenhuma**: ausentes, o anexo fica desligado; metade delas derruba a subida, dizendo qual falta |
| `MEDIA_STORAGE_PUBLIC_ENDPOINT` | não | O endereço com que o navegador alcança o armazenamento, e com que se assina. Padrão: o `MEDIA_STORAGE_ENDPOINT` |
| `MEDIA_STORAGE_REGION` / `MEDIA_STORAGE_FORCE_PATH_STYLE` | não | Padrão `us-east-1` e `true` (o balde no caminho, como o MinIO espera) |
| `MEDIA_STORAGE_UPLOAD_URL_MINUTES` | não | Validade da permissão de envio. Padrão 2 |
| `MEDIA_STORAGE_READ_URL_MINUTES` | não | Validade do link de leitura. Padrão 5 |
| `MEDIA_STORAGE_PLAYBACK_URL_MINUTES` | não | Validade do link de um vídeo antigo, que é lido em pedaços enquanto toca. Padrão 15 |
| `MEDIA_UPLOAD_RATE_LIMIT_PER_MINUTE` | não | Pedidos e confirmações de envio por IP, por minuto. Padrão 20 |
| `TRUSTED_PROXIES` | não | Proxies cujo `X-Forwarded-For` vale — endereço ou rede. Vazio, o IP é o da conexão. Valor inválido derruba a subida |

Número zero ou negativo nas de minutos e na do limite vale o padrão.

A chave de assinatura sai de:

```bash
openssl rand -base64 48
```

O `GOOGLE_CLIENT_ID` sai do console do Google Cloud, em *APIs e serviços →
Credenciais → ID do cliente OAuth*, tipo *aplicativo web*. Não existe client secret:
quem faz o Sign-In é o painel, no navegador, e a API apenas confere o token recebido.

**Variável declarada e vazia conta como ausente.** É o erro de configuração mais
comum, porque o arquivo tem a linha e parece configurado.

---

## A fila

Só é necessária para a **espera antes de quem relatou ver** — a janela entre o time
mover o card e a pessoa lá fora enxergar o movimento — e para o **prazo do pedido de
informação** encerrar sozinho. Sem ela, todo o resto funciona: configurar uma espera
maior que zero é recusado com o motivo, e o pedido de informação fica aberto até quem
relatou responder ou o time agir.

```bash
cd api
docker compose up -d rabbitmq
```

Sobe em `amqp://pds:pds@localhost:5672/`, com a tela de administração em
`http://localhost:15672`. Depois, no `.env.local`:

```
RABBITMQ_URL=amqp://pds:pds@localhost:5672/
```

**A imagem é nossa, e não a oficial.** O RabbitMQ base não traz o
`rabbitmq_delayed_message_exchange`, que é o plugin que segura a mensagem até a
hora. Ver `rabbitmq/Dockerfile`. Servidor sem o plugin recusa a declaração da
troca, e a recusa acontece na subida — que é onde se quer descobrir isso.

> **Em produção isto ainda não existe — Adiado.** O Render não fornece broker, então a
> espera fica indisponível lá até alguém escolher onde a fila roda — e confirmar
> que o plano escolhido permite o plugin.

**O que está agendado não vive na fila.** Vive na coluna `public_stage_due_at` do
relato: a mensagem só carrega a hora de olhar de novo. Por isso derrubar o
ambiente de desenvolvimento não perde nada, e por isso a API reavalia na subida o
que venceu sem ter sido aplicado.

---

## O armazenamento

Só é necessário para **anexar**: imagens e arquivos no relato, na resposta ao time
e na reabertura. Sem ele, todo o resto funciona, e a tela de Mídia recusa ligar o
anexo, dizendo por quê.

```bash
cd api
docker compose up -d minio minio-init
```

Sobe um MinIO — compatível com a API do S3 — em `http://localhost:9000`, com o
console em `http://localhost:9001` (usuário `pds`, senha `pdspdspds`), só em
`127.0.0.1`. O `minio-init` cria o balde `pds-media`, **privado**, e faz a pasta
`uploads/` — onde o navegador grava antes de a API conferir — vencer em um dia.
Depois, no `.env.local`:

```
MEDIA_STORAGE_ENDPOINT=http://localhost:9000
MEDIA_STORAGE_ACCESS_KEY=pds
MEDIA_STORAGE_SECRET_KEY=pdspdspds
MEDIA_STORAGE_BUCKET=pds-media
```

**Os bytes nunca passam pela API.** O navegador pede permissão, manda o arquivo
direto ao balde por um formulário assinado — com o teto de tamanho e o tipo dentro
da assinatura — e confirma; é na confirmação que a API lê os primeiros bytes e
prende o anexo ao relato. A leitura é por link assinado de validade curta, gerado
sob demanda, depois de conferir quem pede.

**Com a API no `docker compose up -d --build`**, o endereço, as chaves e o balde vêm
do próprio compose, e as linhas do `.env.local` não valem: de dentro da rede a API
fala com `minio:9000`, e assina com `localhost:9000`, que é o endereço que o
navegador conhece (`MEDIA_STORAGE_PUBLIC_ENDPOINT`).

> **Em produção isto ainda não existe — Adiado.** Trocar de provedor é trocar variável, desde
> que ele aceite envio por formulário assinado (POST) — o R2 da Cloudflare não
> aceita. A escolha fica para quando houver hospedagem, junto da regra de CORS do
> balde, que precisa deixar o quadro enviar.

---

## O banco

PostgreSQL hospedado, **compartilhado pelo grupo**. O endereço vem no `.env.local`,
que você pede a quem já roda o projeto.

```
Host=<host>;Port=5432;Database=<banco>;Username=<usuario>;Password=<senha>;SSL Mode=Require;Trust Server Certificate=true;
```

Duas armadilhas comuns em banco hospedado:

**Endereço interno x externo.** Muitas hospedagens dão dois: o interno só resolve de
dentro da própria infraestrutura delas. Da sua máquina, use o externo. Se um dia a API
for publicada na mesma hospedagem, aí vale trocar pelo interno — não sai para a
internet e responde mais rápido.

**`SSL Mode=Require`.** A maioria recusa conexão em texto claro.

---

## Migrações

Também a partir da pasta `api`. Os caminhos `--project` são relativos a ela — rodar de
outro lugar falha com `Unable to retrieve project metadata`.

```bash
cd api

# criar
dotnet ef migrations add <Nome> --project Pds.Data --startup-project Pds.WebApi --output-dir Migrations

# aplicar no banco
dotnet ef database update --project Pds.Data --startup-project Pds.WebApi

# ver o que já foi aplicado
dotnet ef migrations list --project Pds.Data --startup-project Pds.WebApi
```

> ⚠️ O banco é compartilhado: **migração aplicada vale para todo mundo na hora.**
> Combine com o grupo antes de rodar `database update`.
