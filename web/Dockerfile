FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV CYPRESS_INSTALL_BINARY=0 NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json .npmrc ./
COPY web/package.json ./web/package.json
COPY api/package.json ./api/package.json
RUN npm ci
COPY web ./web
COPY scripts/prepare-web.mjs ./scripts/prepare-web.mjs
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api
ARG NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
ARG NEXT_PUBLIC_LIVEKIT_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL
RUN npm run build --workspace @diploma/web

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/web/.next/standalone ./
USER node
EXPOSE 3000
CMD ["node", "web/server.js"]
