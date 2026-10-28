FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV CYPRESS_INSTALL_BINARY=0
COPY package.json package-lock.json .npmrc ./
COPY web/package.json ./web/package.json
COPY api/package.json ./api/package.json
RUN npm ci
COPY api ./api
RUN npm run build --workspace @diploma/api

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3001 HOST=0.0.0.0
COPY package.json package-lock.json .npmrc ./
COPY web/package.json ./web/package.json
COPY api/package.json ./api/package.json
RUN npm ci --omit=dev --workspace @diploma/api --include-workspace-root=false && npm cache clean --force
COPY --from=build --chown=node:node /app/api/dist ./api/dist
USER node
WORKDIR /app/api
EXPOSE 3001
CMD ["node", "dist/main.js"]
