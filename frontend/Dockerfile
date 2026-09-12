# Build context is the repo root, not frontend, so that the pnpm workspace
# (root lockfile + packages/*) is available to the install.
#
#   docker build -f frontend/Dockerfile .
#
# On Railway this means Root Directory must be "/" with
# RAILWAY_DOCKERFILE_PATH=frontend/Dockerfile.
FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

WORKDIR /repo

# Manifests first, so a source-only change reuses the install layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/

RUN pnpm install --frozen-lockfile --filter @dorado/frontend...

# NEXT_PUBLIC_* values are inlined at build time, so they must be present
# before the build rather than supplied at runtime.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AUTH_URL
ARG NEXT_PUBLIC_FRONTEND_URL
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ARG NEXT_PUBLIC_DORADO_PHONE_NUMBER
ARG NEXT_PUBLIC_SENTRY_AUTH_TOKEN
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL
ENV NEXT_PUBLIC_FRONTEND_URL=$NEXT_PUBLIC_FRONTEND_URL
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_DORADO_PHONE_NUMBER=$NEXT_PUBLIC_DORADO_PHONE_NUMBER
ENV NEXT_PUBLIC_SENTRY_AUTH_TOKEN=$NEXT_PUBLIC_SENTRY_AUTH_TOKEN
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_DISABLE_ESLINT_PLUGIN=1

COPY frontend frontend

RUN pnpm --filter @dorado/frontend build

WORKDIR /repo/frontend

EXPOSE 3000
CMD ["pnpm", "start"]
