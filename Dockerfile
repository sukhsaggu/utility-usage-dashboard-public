# Stage 1: build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci 2>/dev/null || npm install
COPY . .
ENV VITE_BASE_PATH=/gas-dashboard/
RUN npm run build

# Stage 2: Node server — serves SPA + API so data is shared across browsers
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json* ./
COPY server.mjs ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev
ENV PORT=80
ENV DATA_PATH=/data/dashboard-data.json
EXPOSE 80
CMD ["node", "server.mjs"]
