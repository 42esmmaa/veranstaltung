ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-trixie-slim AS base

RUN npm install --global pnpm@12.19.0
WORKDIR /opt/app
RUN chown node:node /opt/app
USER node

FROM base AS dist

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY --chown=node:node tsconfig.json tsconfig.build.json ./
COPY --chown=node:node src ./src
RUN pnpm build

FROM base AS dependencies

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM dist AS migration

COPY --chown=node:node drizzle.config.ts ./
COPY --chown=node:node drizzle ./drizzle
CMD ["pnpm", "db:migrate"]

FROM node:${NODE_VERSION}-trixie-slim AS final

ENV NODE_ENV=production PORT=3000
WORKDIR /opt/app
USER node

COPY --chown=node:node package.json ./
COPY --from=dist --chown=node:node /opt/app/dist ./dist
COPY --from=dependencies --chown=node:node /opt/app/node_modules ./node_modules

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "--input-type=module", "--eval", "const response = await fetch('http://127.0.0.1:3000/health', { signal: AbortSignal.timeout(2000) }); if (!response.ok) process.exit(1);"]

ENTRYPOINT ["node", "dist/index.js"]
