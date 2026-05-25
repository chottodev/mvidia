# Один образ: api-user → packages/web/dist, api-admin → packages/web-admin/dist
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
ARG USER_PUBLIC_SITE_URL=http://localhost:3001
RUN npm ci \
  && VITE_API_USER_BASE_URL= VITE_PUBLIC_SITE_URL= npm run build -w web \
  && VITE_API_ADMIN_BASE_URL= VITE_PUBLIC_SITE_URL="${USER_PUBLIC_SITE_URL}" npm run build -w web-admin

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages ./packages
COPY --from=build /app/packages/web/dist ./packages/web/dist
COPY --from=build /app/packages/web-admin/dist ./packages/web-admin/dist
RUN npm ci --omit=dev
EXPOSE 3001 3002
CMD ["node", "packages/api-user/src/server.js"]
