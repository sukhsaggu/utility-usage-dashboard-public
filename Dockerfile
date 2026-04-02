# Stage 1: build
FROM node:25-alpine AS builder
# Patch OS packages (e.g. zlib) and use current npm so Trivy does not flag the image’s bundled CLI.
RUN apk update && apk upgrade --no-cache && npm install -g npm@latest
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci 2>/dev/null || npm install
COPY . .
ENV VITE_BASE_PATH=/gas-dashboard/
RUN npm run build

# Stage 2: Node server — serves SPA + API so data is shared across browsers
FROM node:25-alpine
RUN apk update && apk upgrade --no-cache && npm install -g npm@latest
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json* ./
COPY server.mjs ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
ENV PORT=80
ENV DATA_PATH=/data/dashboard-data.json
EXPOSE 80
CMD ["node", "server.mjs"]
