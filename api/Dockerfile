# O SDK roda na arquitetura de quem constroi e publica para a da imagem (TARGETARCH),
# sem emular uma na outra.
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG TARGETARCH
WORKDIR /src

COPY . .

# Para o Alpine (musl) e a arquitetura da imagem. Com a plataforma, a publicacao sai
# pre-compilada (ReadyToRun, no .csproj): o primeiro pedido nao espera a compilacao.
RUN dotnet restore "Pds.WebApi/Pds.WebApi.csproj" --os linux-musl -a $TARGETARCH
RUN dotnet publish "Pds.WebApi/Pds.WebApi.csproj" -c Release --os linux-musl -a $TARGETARCH --no-restore -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine
WORKDIR /app

# A porta pelo nome que a imagem base usa: o ASPNETCORE_URLS sobrescrevia o HTTP_PORTS
# dela e a API avisava disso a cada subida (achado 3 do ensaio local do deploy).
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

COPY --from=build /app/publish .

# Sem privilegio: a imagem base ja traz o usuario `app` (APP_UID=1654). Rodar como ele, e
# nao como root, reduz o estrago se a API for comprometida. A porta 8080 e alta, entao nao
# precisa de root para abrir; o `/app` so e lido. O $APP_UID vem da imagem.
USER $APP_UID

ENTRYPOINT ["dotnet", "Pds.WebApi.dll"]
