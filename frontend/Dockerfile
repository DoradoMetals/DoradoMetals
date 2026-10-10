# Build context is the repo root, not frontend, so that the pnpm workspace
# (root lockfile + packages/*) is available to the install.
#
#   docker build -f frontend/Dockerfile .
#
# On Railway this means Root Directory must be "/" with
# RAILWAY_DOCKERFILE_PATH=frontend/Dockerfile.
FROM node:24-bookworm-slim

RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

WORKDIR /repo

# Manifests first, so a source-only change reuses the install layer. The
# frontend imports five workspace packages (@dorado/client, @dorado/contracts,
# @dorado/components, @dorado/icons, @dorado/theme); pnpm needs each one's
# package.json to resolve the workspace graph for --filter, even though only
# @dorado/contracts ships a build (the rest are consumed as source).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/
COPY packages/contracts/package.json packages/contracts/
COPY packages/client/package.json packages/client/
COPY packages/components/package.json packages/components/
COPY packages/icons/package.json packages/icons/
COPY packages/theme/package.json packages/theme/

RUN pnpm install --frozen-lockfile --filter @dorado/frontend...

# @dorado/client, @dorado/components, @dorado/icons and @dorado/theme ship
# source - Next's transpilePackages compiles them as part of the app build.
# @dorado/contracts ships dist, so it is the one package built ahead of time.
COPY packages packages
RUN pnpm --filter @dorado/contracts build

# NEXT_PUBLIC_* values are inlined at build time, so they must be present
# before the build rather than supplied at runtime.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AUTH_URL
ARG NEXT_PUBLIC_FRONTEND_URL
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ARG NEXT_PUBLIC_SENTRY_AUTH_TOKEN
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL
ENV NEXT_PUBLIC_FRONTEND_URL=$NEXT_PUBLIC_FRONTEND_URL
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_SENTRY_AUTH_TOKEN=$NEXT_PUBLIC_SENTRY_AUTH_TOKEN
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_DISABLE_ESLINT_PLUGIN=1

COPY frontend frontend

RUN pnpm --filter @dorado/frontend build

WORKDIR /repo/frontend

EXPOSE 3000
CMD ["pnpm", "start"]
