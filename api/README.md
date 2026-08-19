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

Não precisa de Docker nem de banco local: o PostgreSQL é hospedado.

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
