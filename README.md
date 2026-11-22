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
- Socket.IO namespace: `/classroom`, on the API port with the Socket.IO path `/api/socket.io`. The initial `system:ping` event returns `system:pong`.

The frontend displays API liveness without requiring PostgreSQL. The `/classroom` namespace requires an authenticated session cookie. Its connection probe exposes no lesson data; lesson membership checks belong to the classroom features.

## Stack and installed libraries

| Area                 | Setup                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| Frontend             | Next.js App Router, React, TypeScript, native Next.js/Turbopack tooling                             |
| API state / realtime | TanStack Query with fetch, Socket.IO client                                                         |
| Backend              | NestJS with Express, config, validation, Helmet, REST and Swagger                                   |
| Database             | PostgreSQL, Prisma CLI/client, PostgreSQL driver adapter and `pg`                                   |
| Authentication       | Fixed-role registration, login/logout, current user, Argon2id and PostgreSQL-backed cookie sessions |
| Media                | LiveKit browser SDK, React components/styles and server SDK; room/token features come later         |
| Storage              | Azure Blob Storage SDK; upload features come later                                                  |
| Testing              | Jest, React Testing Library, Nest testing utilities, Supertest and Cypress                          |
| Local infrastructure | Docker Compose for PostgreSQL; separate FE/BE Dockerfiles                                           |

Direct versions are pinned in the three package manifests; `package-lock.json` locks transitive dependencies. Versions were resolved from npm on 28 October 2026. Compatibility exceptions: TypeScript 6.0.3 (NestJS Swagger and typescript-eslint do not support TypeScript 7 yet), ESLint 9.39.5 (Next's React/import/accessibility lint plugins do not support ESLint 10), and Prisma 7.10.1 (the CLI `latest` tag points to an 8.0 release candidate). Node type definitions follow the selected Node 24 runtime. No Vite is needed with Next.js.

NestJS 12 uses native ES modules. The backend uses `type: module`, NodeNext TypeScript resolution, `.js` extensions in local imports and Prisma's ESM generator. API Jest commands enable Node's VM module support for ESM tests.

At installation, npm reports six low-severity advisories through Jest's `deepmerge` dependency. The production-only audit reports zero vulnerabilities. npm's proposed automatic fix downgrades Jest to version 25; it was not applied to the current Jest 30 setup.

## Database

The database foundation includes 35 domain tables and 2 authentication infrastructure tables, versioned SQL migrations, separate runtime/migration/reporting roles, lookup/demo seeds, integrity triggers, masked reports and isolated PostgreSQL 18 checks. See the [database setup guide](docs/database/README.md), [dictionary](docs/database/data-dictionary.md) and [logical schema](docs/database/logical-schema.md).

Use `npm run db:bootstrap` with a dedicated empty database and administrator provisioning credentials, then `npm run db:deploy` with `MIGRATION_DATABASE_URL`. The running API must use `DATABASE_URL` as `tutor_app`, never the Compose administrator. No cloud or existing-volume reset is required. Run `npm run db:test` for isolated database verification.

Prisma models the tables; reviewed SQL migrations own checks, partial/expression indexes, views, triggers and privileges. Do not use `db push` or blindly generate a schema diff. API build/typecheck generate the Prisma client automatically. Authentication uses the existing account and credential tables. Lesson and homework authorization will be added with those features.

Compose binds PostgreSQL to loopback; `npm run infra:down` preserves its volumes. Compose's sample `diploma` login is for local provisioning only.

## Registration and login (US01 and US02)

The frontend provides `/register` and `/sign-in`, based on Figma A02/A01 at desktop and 402px phone widths. Both use the light semantic colors, IBM Plex Sans and shadcn/Radix controls. Password confirmation also appears on desktop for consistency with the phone flow. Successful authentication opens `/tutor` or `/student`; these account-entry shells show the real authenticated identity and sign-out controls. Lesson and schedule content will accompany their respective stories.

One TanStack Query cache owns the current frontend identity. It rechecks on focus and every minute, hides protected content until identity is verified, routes expired sessions to sign-in, and removes other cached data when identity changes. Credentials stay in the form/request; the backend owns the HttpOnly cookie. Browser tests use isolated API response fixtures for successful authentication and the live backend health endpoint for the connection check.

Set `DATABASE_URL` to the restricted runtime connection and `SESSION_SECRET` to a random value of at least 32 characters in `api/.env`. Configure the same settings in Vercel for deployed authentication. Generate a signing secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and store it privately.

| Endpoint                  | Input                                                                  | Successful result                       |
| ------------------------- | ---------------------------------------------------------------------- | --------------------------------------- |
| `POST /api/auth/register` | `name`, `lastname`, `email`, `password`, `role` (`TUTOR` or `STUDENT`) | 201, account created and signed in      |
| `POST /api/auth/login`    | `email`, `password`                                                    | 200, new authenticated session          |
| `POST /api/auth/logout`   | Current cookie; empty body                                             | 204, session revoked and cookie cleared |
| `GET /api/auth/me`        | Current cookie                                                         | 200, current user                       |

Registration, login and current-user responses contain only `{"user":{"id":"…","name":"Alex","lastname":"Rivera","email":"alex@example.test","role":"STUDENT"}}`. Names are required, trimmed, 1–100 Unicode characters and allow letters, combining marks, spaces, hyphens and apostrophes. Email is trimmed, stored lowercase, limited to 254 characters and uniquely indexed without case distinctions. The `retired.invalid` domain is reserved for anonymized accounts. Email verification and profile editing are separate stories. New passwords contain at least 5 characters, with no character-type or password-length upper restriction. Existing shorter passwords remain usable at login. Role is fixed. Registration signs in immediately.

The `online_tutor.sid` cookie is HttpOnly, SameSite=Lax, scoped to `/api`, and Secure in production/Vercel. The default absolute lifetime is eight hours; `AUTH_SESSION_TTL_SECONDS` accepts 1–604800 seconds. Browser requests use `credentials: 'include'`; browser mutations must originate from the exact `CLIENT_ORIGIN`. Registration and login share a PostgreSQL-backed limit of 20 attempts per client IP per minute. Vercel proxy handling preserves HTTPS cookies and resolves the client IP.

Account and password-hash writes commit atomically. Session IDs rotate on registration/login and are saved before success is returned. If session storage fails after the account commits, registration can return 503 with the account already created; use login after recovery. Missing session configuration returns 503 for registration/login while liveness remains available. All ordinary controller routes require authentication unless explicitly marked public. Authentication checks account retirement and `auth_epoch` on protected requests and classroom events.

Logout disconnects sockets for that session on the current API instance. Every packet rechecks stored authentication; idle sockets on other instances are checked every five seconds. Room-specific authorization will accompany room operations. Inner authentication code depends on account/password ports. Prisma, Argon2id, PostgreSQL session and Nest adapters are selected in `AuthModule`. Tests inject an isolated session store; production uses PostgreSQL.

Run `npm run test:auth:integration` for the HTTP/WebSocket contracts against a disposable migrated PostgreSQL database. It includes concurrent duplicate registration and credential-write rollback checks. The standard API tests use isolated adapters without cloud writes. The PostgreSQL test runner requirements are in [database setup](docs/database/README.md).

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

The Azure deployment option uses Container Apps with separate FE/BE containers, PostgreSQL Flexible Server, Blob Storage and LiveKit Cloud. Durable answer synchronization and multi-replica classroom broadcasts belong to the classroom features.

### Vercel

Use the `online-tutor` repository root for the Vercel project. The project serves two [services](https://vercel.com/docs/services) on one domain.

- `web` runs Next.js from `web/`. It serves the frontend and `/api/health`. Its health handler calls NestJS over `INTERNAL_API_URL`, which Vercel injects at runtime. Leave that variable to Vercel.
- `api` runs NestJS from `api/` using the Node framework preset. Its entry point exports the HTTP server with Socket.IO attached. It handles the other `/api/*` requests, including Swagger at `/api/docs` and Socket.IO at `/api/socket.io`.

Enable Vercel system environment variables so the frontend uses the shared domain. Leave `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SOCKET_URL` unset for the same-origin defaults. Set `CLIENT_ORIGIN` to the exact frontend HTTPS origin for each deployed environment.

To test both services locally, run this command from the repository root after `npm ci`.

```sh
CLIENT_ORIGIN=http://127.0.0.1:3417 vercel dev --local --listen 127.0.0.1:3417
```

Open `http://127.0.0.1:3417` and check `/api/health` for `{"status":"ok","service":"api"}`. The health result verifies the call from Next.js to NestJS.

### PostgreSQL session storage

Apply migrations with `npm run db:deploy` before starting the API. Authentication uses existing `DATABASE_URL` and `SESSION_SECRET`; `REDIS_URL` is unnecessary. Runtime has CRUD access to private session/rate-limit tables, with no schema-creation privileges. Existing Redis sessions are not migrated; users sign in again after rollout.

`private.auth_sessions` stores session IDs, JSON session state and absolute expiry, with an expiry index. Cookies contain only signed session IDs. `private.auth_rate_limits` atomically caps login/register attempts at 20 per IP per minute across API instances; IPs are keyed using HMAC-SHA256 with the shared session secret. Expired counters reset on the next attempt.

A request checks database readiness. Once per 15 minutes per API instance, it also removes up to 1,000 expired rows per table; expiry is enforced on reads even before deletion. No background timer is required, including on serverless hosts. `npm run db:cleanup:auth` removes all expired records for scheduled/offline maintenance; run it every 15 minutes using a scheduler if cleanup must continue without traffic. Session storage uses a pool of at most five connections per API instance; account access has its own pool of five, so size deployment concurrency accordingly.
