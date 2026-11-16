# PostgreSQL database foundation

This directory contains the database deliverables for Online Tutor. Cloud provisioning is not needed to review or test them.

| Deliverable | Location |
| --- | --- |
| Complete column types, defaults, nullability, keys, checks and indexes | [Data dictionary](data-dictionary.md) |
| All 35 tables and 50 foreign keys | [Logical ER diagram](logical-schema.md) |
| Functional dependencies and normalization | [Normalization to 3NF](normalization.md) |
| Database roles, authorization boundary and retirement | [Security](security.md) |
| Indexes, views, triggers, lifecycle functions and examples | [Advanced features](advanced-features.md) |
| Versioned executable DDL | `api/prisma/migrations/` |
| Reference and synthetic data | `scripts/database/reference-seed.mjs`, `demo-seed.mjs` |
| Isolated migration/integrity/security/concurrency checks | `scripts/database/test.mjs` |

## Setup on an empty PostgreSQL 18 database

Use Node 24 (`nvm use`) and the existing installed dependencies (`npm ci` on a new checkout). Commands below run from the repository root. Scripts load `api/.env`; existing shell environment values take precedence. Use a dedicated database. Never use `prisma db push` or reset an existing database to adopt this schema.

1. Create an empty database using an administrator connection, through your local provider or `createdb`. For a disposable demo, choose `online_tutor_demo`. Docker Compose can supply PostgreSQL 18; its initial `diploma` account is a **local administrator for provisioning**, not the API runtime login. Existing Compose volumes are preserved.
2. Set `ADMIN_DATABASE_URL` to that database as its administrator. Supply separate random secrets of at least 16 characters in `MIGRATOR_PASSWORD`, `APP_PASSWORD`, and `REPORTER_PASSWORD`, using your shell or a local secret file. Do not commit credentials.
3. Run `npm run db:bootstrap`. This creates four `tutor_*` roles, makes the NOLOGIN owner own the public schema, and grants owner membership only to the migrator. This command rotates the three login passwords when explicitly rerun. It refuses pre-existing elevated role attributes or unexpected memberships. Use it only on a dedicated project PostgreSQL server: role names and passwords are cluster-wide.
4. Set `MIGRATION_DATABASE_URL` to the same database as `tutor_migrator`, and `DATABASE_URL` as `tutor_app`. Set `REPORTING_DATABASE_URL` as `tutor_reporter` only in reporting tools. URL-encode special characters in passwords; use provider-required TLS outside local development.
5. Run `npm run db:deploy`, `npm run db:seed:reference`, then `npm run db:generate` and `npm run db:validate`.
6. Optional demo: use a database ending in `_demo` or `_test`, set `DEMO_PASSWORD` to a random value of at least 16 characters, and run `npm run db:seed:demo`. Synthetic logins are `demo.tutor` and `demo.student`; authentication endpoints are not implemented by this database work. Passwords are stored as Argon2id hashes. The asset record is a placeholder: no real image is uploaded.

If a database already contains the previous identity-only table or other incompatible objects, stop and inspect/back up it first. These are initial migrations, not an automatic upgrade or adoption script. No existing database was reset during development.

## Reproduce verification

```bash
npm run db:test
```

On macOS the runner discovers PostgreSQL.app; otherwise set `PG_BIN` to the directory containing PostgreSQL 18 `initdb` and `pg_ctl`. It initializes a randomly named temporary cluster, uses SCRAM passwords and a loopback port, provisions roles, applies/replays Prisma migrations, seeds twice and checks behavior through actual application/reporter connections. It stops and removes only its own cluster. A restricted execution environment may need permission for shared memory and localhost connections.

For CI or a disposable container server, instead set `TEST_ADMIN_DATABASE_URL` and `TEST_DATABASE_ISOLATED=1`. **The server must be dedicated to testing:** the suite provisions/rotates the fixed `tutor_*` login roles. It creates and drops its own randomly named database. Never point this at a shared development or production server. GitHub Actions uses a dedicated PostgreSQL service.

The suite checks lifecycle constraints, version immutability, lookups, ten-format seeds, 60% progress, wrong-answer results, notifications, role isolation, atomic choice values, homework returns, concurrent end/submit write cutoffs and retirement. This verifies the database foundation; it is not evidence of implemented HTTP authentication, WebSocket delivery, video or cloud integration.

## Working with Prisma and SQL

The Prisma schema describes all 35 relational models. SQL migrations additionally own checks, partial/expression indexes, views, triggers, functions and grants. These features must survive future migrations. Partial unique indexes intentionally remain SQL-only: a single active link/draft does **not** make the historical collection a one-to-one Prisma relation. Do not overwrite this mapping blindly with `db pull`.

Use `npm run db:deploy` to apply reviewed migrations. For future changes, add a new ordered SQL migration and update the Prisma model in the same change; test from an empty database and against any required upgrade fixture. Do not edit previously deployed migration files. `db:migrate` currently aliases deploy so it cannot silently generate a destructive schema diff. `db:studio` uses the runtime URL, not the migration URL; it can see sensitive backend data, so keep it local.

Regenerate catalog documentation against a freshly migrated database using `npm run db:docs` with the migration URL. The generator reads metadata only and writes the dictionary and Mermaid diagram. The SQL files are the executable source of truth.
