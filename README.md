# Lesson Workspace

A diploma project for one-to-one language lessons. The `online-tutor` repository contains a Next.js client in `web/`, a separate NestJS modular backend in `api/`, and shared scripts and configuration at the root. Business analysis and diploma documents remain in the parent `Diploma/BA/` and `Diploma/Docs/` folders, outside this repository.

## Run locally

Use Node **24.19.0** (`nvm install` then `nvm use`, if you use nvm) and npm 10 or newer. The project deliberately requires Node 24 rather than the machine's older Node 20 default.

```bash
CYPRESS_CACHE_FOLDER="$PWD/.cache/Cypress" npm ci
cp web/.env.example web/.env.local
cp api/.env.example api/.env
npm run dev
```

- Frontend: http://localhost:3000
- API liveness: http://localhost:3001/api/health
- Swagger UI: http://localhost:3001/api/docs
- OpenAPI JSON: http://localhost:3001/api/docs-json
- Socket.IO namespace: `/classroom`, on the API port. The initial `system:ping` event returns `system:pong`.

The frontend displays the API connection status. Health and the connection probe work without PostgreSQL, Redis or cloud credentials. They do not indicate those integrations are ready. The Socket.IO probe does not expose lesson data; authentication and room authorization must be added with classroom features.

## Stack and installed libraries

| Area | Setup |
| --- | --- |
| Frontend | Next.js App Router, React, TypeScript, native Next.js/Turbopack tooling |
| API state / realtime | TanStack Query with fetch, Socket.IO client |
| Backend | NestJS with Express, config, validation, Helmet, REST and Swagger |
| Database | PostgreSQL, Prisma CLI/client, PostgreSQL driver adapter and `pg` |
| Login foundation | Argon2, express-session, connect-redis and Redis client; login is not implemented yet |
| Media | LiveKit browser SDK, React components/styles and server SDK; room/token features come later |
| Storage | Azure Blob Storage SDK; upload features come later |
| Testing | Jest, React Testing Library, Nest testing utilities, Supertest and Cypress |
| Local infrastructure | Docker Compose for PostgreSQL and Redis; separate FE/BE Dockerfiles |

Direct versions are pinned in the three package manifests; `package-lock.json` locks transitive dependencies. Versions were resolved from npm on 28 October 2026. Compatibility exceptions: TypeScript 6.0.3 (NestJS Swagger and typescript-eslint do not support TypeScript 7 yet), ESLint 9.39.5 (Next's React/import/accessibility lint plugins do not support ESLint 10), and Prisma 7.10.1 (the CLI `latest` tag points to an 8.0 release candidate). Node type definitions follow the selected Node 24 runtime. No Vite is needed with Next.js.

NestJS 12 uses native ES modules. The backend uses `type: module`, NodeNext TypeScript resolution, `.js` extensions in local imports and Prisma's ESM generator. API Jest commands enable Node's VM module support for ESM tests.

At installation, npm reports six low-severity advisories through Jest's `deepmerge` dependency. The production-only audit reports zero vulnerabilities. npm's proposed automatic fix downgrades Jest to version 25; it was not applied to the current Jest 30 setup.

## Database and Redis

Install/start Docker Desktop or another compatible Docker engine, then:

```bash
npm run infra:up
npm run db:validate
npm run db:migrate -- --name init
```

The migration command uses the `DATABASE_URL` in `api/.env`. The initial schema contains only users with a fixed tutor/student role. No migration has been applied by this setup. Generate the Prisma client with `npm run db:generate`; API build/typecheck also generate it. Later database services should create PrismaClient with the installed `@prisma/adapter-pg` adapter.

Compose binds PostgreSQL and Redis to loopback. The sample database credentials are for local development only. `npm run infra:down` preserves the Docker volumes.

## Commands and checks

```bash
npm run dev:web       # only Next.js
npm run dev:api       # only NestJS
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run test:smoke    # after build; starts/stops production apps, uses ports 3000/3001
npm run test:e2e      # same checks plus Cypress in a real browser
npm run check        # lint + typecheck + tests + build
```

After building, run either app in production mode with `npm run start --workspace @diploma/web` or `npm run start --workspace @diploma/api`. The web build prepares a standalone server with its public/static assets, matching the frontend container.

Keep ports 3000/3001 free for smoke/E2E tests. Cypress's browser binary is stored in the project's ignored `.cache/Cypress` directory during initial installation. For a fresh install, set `CYPRESS_CACHE_FOLDER="$PWD/.cache/Cypress" npm ci`; if necessary, run `CYPRESS_CACHE_FOLDER="$PWD/.cache/Cypress" npx cypress install`. The npm package is separate from its downloaded browser binary.

GitHub Actions runs checks and browser smoke coverage on pushes and pull requests once this folder is published to a GitHub repository. Deployment is not configured; Azure resources, identities and secrets are needed first.

## Containers and deployment

Run Docker builds from the repository root:

```bash
docker build -f api/Dockerfile -t diploma-api .
docker build -f web/Dockerfile -t diploma-web .
```

For deployment, pass the public API, Socket.IO and LiveKit URLs as frontend **build arguments** (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`, `NEXT_PUBLIC_LIVEKIT_URL`). Next.js embeds those values at build time. Give the backend its private settings at runtime and set `CLIENT_ORIGIN` to the frontend's exact HTTPS origin. Keep LiveKit API secrets, database credentials and Azure credentials on the backend.

The intended cloud target is Azure Container Apps with separate FE/BE containers, PostgreSQL Flexible Server, Managed Redis, Blob Storage and LiveKit Cloud. No cloud resources are provisioned. Start with one API replica; authenticated sockets, session/CSRF protection, durable answer synchronization and multi-replica Socket.IO coordination belong to feature implementation.
