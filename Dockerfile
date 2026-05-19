# Образы для запуска API (см. docker-compose). Стадия build — для CI-сборки статики фронтов.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci \
  && npm run build -w web \
  && npm run build -w web-admin

FROM node:22-bookworm-slim AS api-user
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci --omit=dev
EXPOSE 3001
CMD ["node", "packages/api-user/src/server.js"]

FROM node:22-bookworm-slim AS api-admin
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci --omit=dev
EXPOSE 3002
CMD ["node", "packages/api-admin/src/server.js"]
