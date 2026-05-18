FROM node:20.11-bookworm-slim AS build
WORKDIR /repo
COPY pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/telephony-bridge ./apps/telephony-bridge
RUN corepack enable && corepack prepare pnpm@9.7.0 --activate \
 && pnpm install --frozen-lockfile \
 && pnpm --filter @aicc2/telephony-bridge build

FROM node:20.11-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/telephony-bridge/dist ./dist
COPY --from=build /repo/apps/telephony-bridge/package.json ./
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/node_modules ./node_modules
EXPOSE 8080
USER node
CMD ["node", "dist/index.js"]
