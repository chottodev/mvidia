# Сборка фронтов (same-origin: пустой VITE_*_BASE_URL в prod → API на том же хосте)
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
ARG USER_PUBLIC_SITE_URL=http://localhost:3001
RUN npm ci \
  &&  VITE_API_USER_BASE_URL= \
      VITE_PUBLIC_SITE_URL=${USER_PUBLIC_SITE_URL} \
      npm run build -w web \
  &&  VITE_API_ADMIN_BASE_URL= \
      VITE_PUBLIC_SITE_URL="${USER_PUBLIC_SITE_URL}" \
      npm run build -w web-admin

# Клиентский стек: API + UI
FROM node:22-bookworm-slim AS api-user
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY --from=build /app/packages/web/dist /app/ui
RUN npm ci --omit=dev

# Админский стек: API + UI
FROM node:22-bookworm-slim AS api-admin
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY --from=build /app/packages/web-admin/dist /app/ui
RUN npm ci --omit=dev
