FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS base

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

FROM base AS dependencies

COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder

ARG NEXT_PUBLIC_GOOGLE_ENABLED=false
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=

ENV DATABASE_URL=file:/tmp/five-o-build.db \
    NEXT_PUBLIC_GOOGLE_ENABLED=${NEXT_PUBLIC_GOOGLE_ENABLED} \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=${NEXT_PUBLIC_VAPID_PUBLIC_KEY} \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY next.config.ts postcss.config.mjs tsconfig.json ./
COPY prisma ./prisma
COPY public ./public
COPY scripts ./scripts
COPY src ./src
COPY server.ts ./server.ts

RUN npm run build \
    && npm prune --omit=dev \
    && npm ls --omit=dev

FROM base AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1 \
    npm_config_cache=/tmp/npm-cache

RUN mkdir -p /app /data /tmp/npm-cache \
    && chown -R node:node /app /data /tmp/npm-cache

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/next.config.ts /app/tsconfig.json ./
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/scripts ./scripts
COPY --from=builder --chown=node:node /app/src ./src
COPY --from=builder --chown=node:node /app/server.ts ./server.ts

USER node

EXPOSE 3000
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health',{cache:'no-store'}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["npm", "start"]
