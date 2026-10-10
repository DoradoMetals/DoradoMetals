# Node 24 runs TypeScript directly by stripping types, so there is no build
# step: src/server.ts and any converted .ts file are executed as-is. Type CHECKING
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
#
# deb.debian.org has returned transient 404s mid-build on Railway, so the
# update+install pair gets both apt's own retry count and an outer retry loop.
RUN for i in 1 2 3 4 5; do \
      apt-get -o Acquire::Retries=5 update && \
      apt-get -o Acquire::Retries=5 install -y --no-install-recommends \
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
      && break || sleep 5; \
    done \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Pin the container clock to UTC. exchange stores naive timestamps, which
# node-postgres parses in the process timezone - so the same row reads back
# differently depending on TZ. Production happens to be UTC already, which is
# why nothing has noticed; this makes it deliberate rather than incidental.
ENV TZ=UTC

RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

WORKDIR /repo

# Manifests first, so a source-only change reuses the install layer. The api
# depends on three workspace packages at runtime - @dorado/contracts for the
# generated row/wire types, and @dorado/components + @dorado/theme for the PDF
# and email templates (src/domains/documents) - so pnpm needs each one's
# package.json to resolve the workspace graph for --filter.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/components/package.json packages/components/
COPY packages/icons/package.json packages/icons/
COPY packages/theme/package.json packages/theme/

RUN pnpm install --frozen-lockfile --filter @dorado/api...

# @dorado/components and @dorado/theme ship source and are imported directly
# (Node 24 strips types; the document/email entry points are plain .ts, no
# JSX). @dorado/icons is @dorado/components' own dependency, not the api's,
# but its source has to be on disk for that workspace link to resolve.
# @dorado/contracts ships dist, so it is the one package built ahead of time.
COPY packages packages
RUN pnpm --filter @dorado/contracts build

COPY api api

WORKDIR /repo/api

EXPOSE 5000
CMD ["node", "src/server.ts"]
