FROM node:20-bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive

# ffmpeg + curl + CA certs (curl used by healthcheck)
RUN set -eux; \
  apt-get update -o Acquire::Retries=3; \
  apt-get install -y --no-install-recommends ffmpeg ca-certificates curl; \
  rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=8000 \
    DATA_DIR=/data \
    DB_FILE=/data/app.db

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
COPY scripts ./scripts

EXPOSE 8000
CMD ["sh", "-c", "node scripts/migrate.js && node src/index.js"]

