# Advanced database features

## Query-driven indexes

Primary and unique keys protect identity and ordering. Additional indexes support the actual access paths:

| Access path | Index family / reason |
| --- | --- |
| Login lookup | `users_username_ci_key`: unique `lower(username)` for case-insensitive login. |
| One active tutor per student | `tutor_students_one_active_tutor`: partial unique index where `ended_at IS NULL`; historical links remain many-to-one. |
| Tutor libraries | `tasks_owner_library_idx`, `lessons_owner_library_idx`: owner, archive marker and creation ordering. |
| Dashboard schedule/history | `sessions_schedule_idx`, `sessions_history_idx`: link plus chronological start/end, with a terminal-state partial index. |
| Current response | Unique `(response_id, revision_no)` supports the latest revision LATERAL query; a separate `(response_id, client_event_id)` key detects retries. |
| One response per context | Partial live and homework input unique indexes avoid NULL-based duplicate streams. |
| Homework drafts/deadlines | `homework_revisions_one_draft`, deadline and submitted-at indexes support actionable homework lists. |
| Task/lesson/choice relationships | FK indexes and parent-position unique indexes support joins and ordered rendering. |

The complete physical index definitions appear in the dictionary. These choices are based on expected queries, not a claim of measured production performance. Use `EXPLAIN (ANALYZE, BUFFERS)` with realistic volumes before adding or removing indexes. PostgreSQL may correctly use sequential scans on the tiny demo dataset.

## Views

| View | Purpose / access |
| --- | --- |
| `public.latest_responses` | Latest committed answer revision and whether it contains an answer; backend only. |
| `public.live_task_progress` | Answered required inputs divided by all required inputs, separate from correctness. |
| `public.session_summaries` | Participants, schedule, pinned content and revealed-item count. |
| `public.classroom_revealed_content` | Revealed blocks only, active marker, no answer keys; backend still authorizes session access. |
| `private.response_evaluations` | Latest correctness from private pinned keys; writing returns NULL for manual review. |
| `public.released_live_results` | Correctness only for items with a tutor release marker. |
| `public.released_live_comments` | Only comments explicitly released by tutor, tied to reviewed revision. |
| `public.homework_revision_status` | Draft, awaiting review, reviewed or returned; late/overdue indicators. |
| `public.unread_lesson_notifications` | Creation-only student notifications whose read marker is NULL. |
| `reporting.account_activity` | Pseudonymous account-level activity, no direct identity/free text. |
| `reporting.session_counts` | Session counts grouped by lifecycle state. |

## Integrity triggers and lifecycle functions

Published task/lesson versions and their children become immutable. Publication checks reject missing inputs, incompatible answer representation, missing keys, incorrect true/false options, incomplete token ordering or invalid image configuration. Choice membership is relational and constrained to the same version. No function automatically rewrites an earlier published version.

`start_session(uuid)` pins the highest numbered published lesson version and starts the session atomically. `end_session(uuid)` clears its active item and ends it atomically. Reveals must belong to the pinned version, chat senders must be participants and feedback must reference the correct live/homework context. Terminal sessions reject new answers/chat. Schedule changes are allowed only before start; no unapproved no-overlap booking rule is introduced.

Homework content freezes when its first attempt starts. Submission requires an answer for every required input; submitted answers cannot change. A tutor can return a submitted attempt with a reason, then a new numbered attempt is created. Manual review completeness derives from feedback on the submitted answer versions.

Answers are append-only events with consecutive stream numbers and client retry IDs. Choice values must be inserted in the **same transaction** as their revision. `write_transaction` is server assigned; deferred constraint triggers validate the final shape at commit (one selected answer for single-choice, no choices for text, contiguous token positions). An empty selection clears a choice response; a non-empty ordering must include all allowed tokens. Confirm the WebSocket save only after COMMIT succeeds. The API must recognize retry IDs and return the already saved result; the database rejects duplicates rather than silently duplicating them.

Response writes lock the same session/homework-attempt parent that end/submit modifies. Tests prove a concurrent close operation waits or times out while an answer transaction is open, then late writes fail after close. This follows [PostgreSQL row locking](https://www.postgresql.org/docs/18/explicit-locking.html). Treat deadlock/serialization failures as retryable in the future service layer; the database does not promise no transaction ever needs a retry. For the diploma's one-to-one classroom, coarse parent serialization favors correctness over very high write throughput.

Creation-only notification rows are inserted automatically with a session. Reading sets a monotonic marker; the unread view stops returning that notification. No reminder scheduler is added. Retirement and reporting masking are described in [Security](security.md).

## Parameterized query examples for the backend

```sql
-- Authorize participant ownership first; $1 is a link belonging to that user.
SELECT * FROM public.session_summaries
WHERE session_id IN (SELECT id FROM public.sessions WHERE tutor_student_id=$1)
ORDER BY scheduled_start DESC;

-- Tutor's confirmed progress; percent is completion, not accuracy.
SELECT * FROM public.live_task_progress WHERE session_item_id=$1;

-- Student-facing results: only after checking participant ownership.
SELECT * FROM public.released_live_results WHERE session_item_id=$1;

-- One text edit (BEGIN/COMMIT required when adding relational choices too).
BEGIN;
INSERT INTO public.response_revisions(response_id,revision_no,client_event_id,text_value)
VALUES ($1,$2,$3,$4);
COMMIT;

-- Separate reporting login; no raw table privileges required.
SELECT * FROM reporting.session_counts;
```

SQL functions satisfy the advanced procedural requirement; no redundant stored procedure is added merely to increase the object count.
