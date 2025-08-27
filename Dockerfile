FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# ffmpeg + yt-dlp (yt-dlp depends on python3; apt handles it)
RUN set -eux; \
  apt-get update -o Acquire::Retries=3; \
  apt-get install -y --no-install-recommends \
    ffmpeg \
    yt-dlp \
    ca-certificates \
    curl; \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (better cache)
COPY package*.json ./
RUN npm ci --only=production

# Copy app
COPY src ./src
COPY public ./public

# Runtime config
RUN mkdir -p /data
ENV DATA_DIR=/data
ENV PORT=8000

EXPOSE 8000
CMD ["node", "src/index.js"]
