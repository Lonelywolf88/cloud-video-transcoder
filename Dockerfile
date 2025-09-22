FROM node:20-bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive

# ffmpeg + curl + CA certs (curl used by healthcheck)
RUN set -eux;   apt-get update -o Acquire::Retries=3;   apt-get install -y --no-install-recommends ffmpeg ca-certificates curl;   rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production     PORT=8000

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public

EXPOSE 8000
CMD ["node", "src/index.js"]
