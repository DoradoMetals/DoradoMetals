# Node 24 runs TypeScript directly by stripping types, so there is no build
# step: server.js and any converted .ts file are executed as-is. Type CHECKING
# is a separate concern and happens in CI via tsc --noEmit.
#
# Build context is the repo root, not api, so that the pnpm workspace
# (root lockfile + packages/*) is available to the install.
#
#   docker build -f api/Dockerfile .
#
# On Railway this means Root Directory must be "/" with
# RAILWAY_DOCKERFILE_PATH=api/Dockerfile.
FROM node:24-bookworm-slim

# Puppeteer renders the PDFs. Use the distro's Chromium rather than the copy
# puppeteer would download, so PUPPETEER_SKIP_DOWNLOAD is set before install.
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    wget \
    --no-install-recommends \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

WORKDIR /repo

# Manifests first, so a source-only change reuses the install layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json api/

RUN pnpm install --frozen-lockfile --filter @dorado/api...

COPY api api

WORKDIR /repo/api

EXPOSE 5000
CMD ["node", "server.js"]
