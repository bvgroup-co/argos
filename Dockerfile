# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install --global pnpm@11.4.0

FROM base AS build
ARG TURBO_TEAM
ENV TURBO_TEAM=$TURBO_TEAM
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /app
RUN pnpm fetch

COPY . /app
RUN pnpm install --offline --frozen-lockfile --config.confirmModulesPurge=false
RUN --mount=type=secret,id=TURBO_TOKEN \
  if [ -f /run/secrets/TURBO_TOKEN ]; then \
    TURBO_TOKEN="$(cat /run/secrets/TURBO_TOKEN)" BUILD_MODE=production pnpm run build; \
  else \
    BUILD_MODE=production pnpm run build; \
  fi
RUN pnpm run clean-deps
RUN pnpm install --prod

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
# pnpm 11 auto-runs `pnpm install` before every `pnpm run` to check whether
# node_modules is in sync with the lockfile. In this image deps are already
# installed and /app is owned by root while the container runs as uid 1001,
# so that auto-install crashes with EACCES. Disable the check; the lockfile
# is frozen at build time.
RUN printf 'verify-deps-before-run=false\n' > /app/.npmrc
EXPOSE 4001
CMD ["node", "apps/backend/dist/processes/proc/web.js"]
