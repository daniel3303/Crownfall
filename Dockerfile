# syntax=docker/dockerfile:1

# Client: the Vite build reads ../content/game.json, so content/ is copied beside client/.
FROM node:24-alpine AS client
WORKDIR /src
COPY client/package.json client/package-lock.json client/
RUN cd client && npm ci --no-audit --no-fund
COPY content content
COPY client client
RUN cd client && npm run build

# Server: restore on project files first so source edits keep the package layer cached.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS server
WORKDIR /src
COPY global.json Directory.Build.props Directory.Packages.props ./
COPY src/Crownfall.Sim/Crownfall.Sim.csproj src/Crownfall.Sim/
COPY src/Crownfall.Server/Crownfall.Server.csproj src/Crownfall.Server/
RUN dotnet restore src/Crownfall.Server/Crownfall.Server.csproj
COPY src src
RUN dotnet publish src/Crownfall.Server/Crownfall.Server.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=server /app ./
COPY --from=client /src/client/dist ./wwwroot
COPY content/game.json ./content/game.json
ENV ASPNETCORE_URLS=http://+:8080 \
    Content__Path=/app/content/game.json \
    DOTNET_gcServer=0
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "Crownfall.Server.dll"]
