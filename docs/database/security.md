# Database access and personal data

## PostgreSQL privilege roles

| Role | Login | Ownership / membership | Permissions |
| --- | --- | --- | --- |
| `tutor_owner` | No | Owns application schemas, tables, functions and views | Used only by migrations and narrowly granted elevated functions. |
| `tutor_migrator` | Yes | Member of owner; owns Prisma migration bookkeeping | Applies reviewed DDL; never used by the running API. |
| `tutor_app` | Yes | No owner membership; owns no application table | Explicit domain SELECT/INSERT, column-scoped UPDATE, selected draft DELETE and lifecycle function execution. No CREATE schema/table, role creation, database creation, superuser or BYPASSRLS. |
| `tutor_reporter` | Yes | No owner membership | SELECT only on `reporting.account_activity` and `reporting.session_counts`. No raw tables, credentials, answer keys, messages, comments or retirement execution. |

The application profile types `TUTOR` and `STUDENT` are rows in `roles`. They are not PostgreSQL login accounts. The server shares one restricted database login; PostgreSQL therefore cannot infer the current browser user. Resource ownership, tutor-only reveal/release, student response access and retirement permissions **must** be checked in the backend before using these tables/functions. RLS is not configured. Do not expose database credentials to the browser.

`private` is backend-only organization, not a boundary against a compromised backend login: the API needs credentials for authentication and keys for grading. Explicit student DTOs must exclude credentials, keys, unrevealed blocks and unreleased feedback. The revealed-content view omits hidden blocks and keys but still requires a session/participant authorization filter.

Functions with `SECURITY DEFINER` are restricted to `start_session`, `end_session`, `retire_account`, and the notification trigger. They are owned by the NOLOGIN owner, use a fixed `pg_catalog` search path and qualify domain relations. PUBLIC execution is revoked. Elevated functions accept IDs; API ownership checks remain mandatory. Invoker trigger helpers also use a fixed search path. Privilege handling follows the [PostgreSQL 18 privilege model](https://www.postgresql.org/docs/18/ddl-priv.html) and [safe definer function guidance](https://www.postgresql.org/docs/18/sql-createfunction.html).

## Account retirement

`SELECT public.retire_account($1)` runs transactionally and can be called again safely. It rejects an account involved in an active lesson, deletes its credential hash, replaces names with `Retired Account` and email with `retired-<uuid>@retired.invalid`, resets timezone, increments `auth_epoch` once, closes active tutor links and revokes its unused invitations. Primary/foreign keys and lesson/homework history remain. Triggers prevent new credentials or profile restoration for a retired account.

This is direct-identity removal and historical **pseudonymization**, not a guarantee of irreversible anonymity. A UUID remains, and names may exist in chat, answers, feedback, filenames, backups or external services. Production retention and erasure policies require a separate decision. No claim of GDPR compliance or complete erasure is made.

The US01/US02 API rejects retired accounts and validates `auth_epoch` on protected HTTP requests and classroom admission/events. Logout revokes the current PostgreSQL session. Idle sockets recheck authentication every five seconds, so account retirement also disconnects idle clients. The retirement routine remains an operator/database operation; it has no public HTTP endpoint.

## Masked reporting

`reporting.account_activity` exposes `account-<md5(uuid)>`, role, retired flag and aggregate counts. The hash is only a stable pseudonymous label, not a cryptographic anonymity guarantee or password hashing mechanism. Reporting excludes raw IDs, login names, profile names, hashes, invitations, content/free text and storage object keys. Reporter access is tested through a real separate connection.

Only synthetic accounts are seeded. Demo passwords are supplied through an environment variable and hashed with Argon2id; raw passwords/tokens are never committed. Outside local testing, require provider TLS, manage secrets separately, restrict network access and review backup/retention settings before using real personal data.

Identity changes use migration `202611200001_email_identity`. It refuses populated legacy installations rather than guessing names/email. The current Neon installation had zero accounts at migration preparation. Runtime cannot update names/email; profile editing is out of scope.

## Login session storage

`private.auth_sessions` and `private.auth_rate_limits` are owned by `tutor_owner`. Only `tutor_app` receives CRUD permissions; reporting cannot read session payloads or rate-limit keys. Runtime never creates these tables. Schema changes use the migration role. These infrastructure tables are separate from lesson `public.sessions`, preserve stable application history and contain no password hashes. Browser cookies contain signed session IDs only. Rate-limit keys are HMAC hashes of IP addresses. Expiry indexes support bounded request-driven cleanup and `npm run db:cleanup:auth` for scheduled maintenance.
