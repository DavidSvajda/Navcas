FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY scripts/backup.ts ./scripts/backup.ts
RUN npx esbuild scripts/backup.ts --bundle --platform=node --format=esm --target=node18 --outfile=/backup.mjs

FROM postgres:17-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends nodejs restic ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /backup.mjs /opt/navcas/backup.mjs
USER 10001:10001
ENTRYPOINT ["node", "/opt/navcas/backup.mjs"]
