FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Production image ---
FROM node:22-alpine

# Docker CLI for restarting the connector container
RUN apk add --no-cache docker-cli

WORKDIR /app

# Only install production dependencies (express)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js .
COPY --from=builder /app/dist ./dist

RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/data

EXPOSE 3001

CMD ["node", "server.js"]
