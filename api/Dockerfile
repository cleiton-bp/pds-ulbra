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

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

COPY --from=build /app/publish .

ENTRYPOINT ["dotnet", "Pds.WebApi.dll"]
