# A migracao como passo do deploy: o pacote do EF (`dotnet ef migrations bundle`), um
# executavel que aplica as migracoes que faltam e sai. O implantar.sh roda antes de a versao
# nova da API subir, com a mesma DB_CONNECTION_STRING dela.
#
# Contexto: a pasta api/ (o .dockerignore de la deixa de fora bin/, obj/ e o .env.local).
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG TARGETARCH
WORKDIR /src
COPY . .
RUN dotnet tool install --global dotnet-ef --version 10.0.11
ENV PATH="$PATH:/root/.dotnet/tools"
# O DataContextFactory pede a conexao ao montar o contexto; o pacote nao conecta, entao
# qualquer valor serve aqui. A de verdade vem na hora de rodar.
RUN rid=$([ "$TARGETARCH" = "amd64" ] && echo linux-musl-x64 || echo linux-musl-arm64); \
    dotnet restore Pds.WebApi/Pds.WebApi.csproj -r $rid && \
    DB_CONNECTION_STRING="Host=nenhum;Database=nenhum" \
    dotnet ef migrations bundle --project Pds.Data --startup-project Pds.WebApi \
      --target-runtime $rid --self-contained --configuration Release -o /out/efbundle

FROM mcr.microsoft.com/dotnet/runtime-deps:10.0-alpine
COPY --from=build /out/efbundle /efbundle
USER $APP_UID
ENTRYPOINT ["/efbundle"]
