# Data dictionary

Generated from PostgreSQL 18 by `npm run db:docs`. SQL migrations remain authoritative. UUID keys are stable; timestamps are `timestamptz`; all foreign keys use NO ACTION on update/delete to protect history. Nullable columns are explicitly marked.

## private.auth_rate_limits

Shared fixed-window authentication limits using HMAC-hashed IP keys; expires after one minute.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| key_hash | character varying(64) | NO | — | HMAC-SHA256 of client IP using shared session secret; no raw IP address. |
| attempts | integer | NO | — | Authentication attempts in current fixed window; capped at 21, with attempts 1–20 allowed. |
| expires_at | timestamp with time zone | NO | — | Invitation or authentication rate-window expiry time, depending on the table. |

Constraints:

- `auth_rate_limits_attempts_check`: `CHECK (((attempts >= 1) AND (attempts <= 21)))`
- `auth_rate_limits_attempts_not_null`: `NOT NULL attempts`
- `auth_rate_limits_expires_at_not_null`: `NOT NULL expires_at`
- `auth_rate_limits_key_hash_check`: `CHECK (((key_hash)::text ~ '^[a-f0-9]{64}$'::text))`
- `auth_rate_limits_key_hash_not_null`: `NOT NULL key_hash`
- `auth_rate_limits_pkey`: `PRIMARY KEY (key_hash)`

Indexes (including PK/unique enforcement):

- `auth_rate_limits_expiry_idx`: `CREATE INDEX auth_rate_limits_expiry_idx ON private.auth_rate_limits USING btree (expires_at)`
- `auth_rate_limits_pkey`: `CREATE UNIQUE INDEX auth_rate_limits_pkey ON private.auth_rate_limits USING btree (key_hash)`

## private.auth_sessions

Private server-side login sessions referenced by HttpOnly cookies; unrelated to lesson sessions.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| sid | character varying | NO | — | Cryptographically random login session ID, referenced by a signed HttpOnly cookie. |
| sess | json | NO | — | Server-side session JSON: cookie metadata and user ID/auth epoch/absolute expiry; no password or answer keys. |
| expire | timestamp with time zone | NO | — | Indexed absolute login session expiry; expired sessions are rejected before cleanup. |

Constraints:

- `auth_sessions_expire_not_null`: `NOT NULL expire`
- `auth_sessions_pkey`: `PRIMARY KEY (sid)`
- `auth_sessions_sess_not_null`: `NOT NULL sess`
- `auth_sessions_sid_not_null`: `NOT NULL sid`

Indexes (including PK/unique enforcement):

- `auth_sessions_expire_idx`: `CREATE INDEX auth_sessions_expire_idx ON private.auth_sessions USING btree (expire)`
- `auth_sessions_pkey`: `CREATE UNIQUE INDEX auth_sessions_pkey ON private.auth_sessions USING btree (sid)`

## private.task_choice_keys

Private expected choice sets or token order.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| input_id | uuid | NO | — | Reference to input. |
| choice_id | uuid | NO | — | Reference to choice. |
| expected_position | integer | YES | — | Expected token order; NULL for unordered choice sets. |

Constraints:

- `task_choice_keys_choice_id_not_null`: `NOT NULL choice_id`
- `task_choice_keys_expected_position_check`: `CHECK ((expected_position > 0))`
- `task_choice_keys_input_id_choice_id_fkey`: `FOREIGN KEY (input_id, choice_id) REFERENCES task_input_choices(input_id, choice_id)`
- `task_choice_keys_input_id_not_null`: `NOT NULL input_id`
- `task_choice_keys_pkey`: `PRIMARY KEY (input_id, choice_id)`

Indexes (including PK/unique enforcement):

- `task_choice_keys_choice_idx`: `CREATE INDEX task_choice_keys_choice_idx ON private.task_choice_keys USING btree (choice_id)`
- `task_choice_keys_order_key`: `CREATE UNIQUE INDEX task_choice_keys_order_key ON private.task_choice_keys USING btree (input_id, expected_position) WHERE (expected_position IS NOT NULL)`
- `task_choice_keys_pkey`: `CREATE UNIQUE INDEX task_choice_keys_pkey ON private.task_choice_keys USING btree (input_id, choice_id)`

## private.task_text_keys

Private accepted text alternatives, compared after trimming and lowercasing.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| input_id | uuid | NO | — | Reference to input. |
| variant_no | integer | NO | — | Positive accepted-text alternative number for this input. |
| accepted_text | text | NO | — | One accepted text answer; private to the backend/tutor. |

Constraints:

- `task_text_keys_accepted_text_check`: `CHECK ((btrim(accepted_text) <> ''::text))`
- `task_text_keys_accepted_text_not_null`: `NOT NULL accepted_text`
- `task_text_keys_input_id_fkey`: `FOREIGN KEY (input_id) REFERENCES task_inputs(id)`
- `task_text_keys_input_id_not_null`: `NOT NULL input_id`
- `task_text_keys_pkey`: `PRIMARY KEY (input_id, variant_no)`
- `task_text_keys_variant_no_check`: `CHECK ((variant_no > 0))`
- `task_text_keys_variant_no_not_null`: `NOT NULL variant_no`

Indexes (including PK/unique enforcement):

- `task_text_keys_distinct_variant`: `CREATE UNIQUE INDEX task_text_keys_distinct_variant ON private.task_text_keys USING btree (input_id, lower(btrim(accepted_text)))`
- `task_text_keys_pkey`: `CREATE UNIQUE INDEX task_text_keys_pkey ON private.task_text_keys USING btree (input_id, variant_no)`

## private.user_credentials

Backend-only Argon2id hashes; removed when the account is retired.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| user_id | uuid | NO | — | Reference to user. |
| password_hash | text | NO | — | Argon2id encoded password hash; never plaintext. |

Constraints:

- `user_credentials_password_hash_check`: `CHECK ((password_hash ~~ '$argon2id$%'::text))`
- `user_credentials_password_hash_not_null`: `NOT NULL password_hash`
- `user_credentials_pkey`: `PRIMARY KEY (user_id)`
- `user_credentials_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES users(id)`
- `user_credentials_user_id_not_null`: `NOT NULL user_id`

Indexes (including PK/unique enforcement):

- `user_credentials_pkey`: `CREATE UNIQUE INDEX user_credentials_pkey ON private.user_credentials USING btree (user_id)`

## public.assets

Owned image metadata; binaries remain in object storage.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | Stable UUID identifier. |
| owner_id | uuid | NO | — | Reference to owner. |
| object_key | text | NO | — | Private storage object identifier; not a public/signed URL. |
| media_type | text | NO | — | Allowed image MIME type. |
| byte_size | bigint | NO | — | Positive file size in bytes. |
| created_at | timestamp with time zone | NO | now() | Record creation time. |

Constraints:

- `assets_byte_size_check`: `CHECK ((byte_size > 0))`
- `assets_byte_size_not_null`: `NOT NULL byte_size`
- `assets_created_at_not_null`: `NOT NULL created_at`
- `assets_id_not_null`: `NOT NULL id`
- `assets_media_type_check`: `CHECK ((media_type = ANY (ARRAY['image/png'::text, 'image/jpeg'::text, 'image/webp'::text])))`
- `assets_media_type_not_null`: `NOT NULL media_type`
- `assets_object_key_check`: `CHECK ((btrim(object_key) <> ''::text))`
- `assets_object_key_key`: `UNIQUE (object_key)`
- `assets_object_key_not_null`: `NOT NULL object_key`
- `assets_owner_id_fkey`: `FOREIGN KEY (owner_id) REFERENCES users(id)`
- `assets_owner_id_not_null`: `NOT NULL owner_id`
- `assets_pkey`: `PRIMARY KEY (id)`

Indexes (including PK/unique enforcement):

- `assets_object_key_key`: `CREATE UNIQUE INDEX assets_object_key_key ON public.assets USING btree (object_key)`
- `assets_owner_idx`: `CREATE INDEX assets_owner_idx ON public.assets USING btree (owner_id)`
- `assets_pkey`: `CREATE UNIQUE INDEX assets_pkey ON public.assets USING btree (id)`

## public.chat_messages

Immutable participant messages saved during an active lesson.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | Stable UUID identifier. |
| session_id | uuid | NO | — | Reference to session. |
| sender_id | uuid | NO | — | Reference to sender. |
| client_message_id | uuid | NO | — | Client retry identifier, unique within session and sender. |
| body | text | NO | — | Non-empty chat text, maximum 10,000 characters. |
| created_at | timestamp with time zone | NO | now() | Record creation time. |

Constraints:

- `chat_messages_body_check`: `CHECK (((btrim(body) <> ''::text) AND (char_length(body) <= 10000)))`
- `chat_messages_body_not_null`: `NOT NULL body`
- `chat_messages_client_message_id_not_null`: `NOT NULL client_message_id`
- `chat_messages_created_at_not_null`: `NOT NULL created_at`
- `chat_messages_id_not_null`: `NOT NULL id`
- `chat_messages_pkey`: `PRIMARY KEY (id)`
- `chat_messages_sender_id_fkey`: `FOREIGN KEY (sender_id) REFERENCES users(id)`
- `chat_messages_sender_id_not_null`: `NOT NULL sender_id`
- `chat_messages_session_id_fkey`: `FOREIGN KEY (session_id) REFERENCES sessions(id)`
- `chat_messages_session_id_not_null`: `NOT NULL session_id`
- `chat_messages_session_id_sender_id_client_message_id_key`: `UNIQUE (session_id, sender_id, client_message_id)`

Indexes (including PK/unique enforcement):

- `chat_messages_order_idx`: `CREATE INDEX chat_messages_order_idx ON public.chat_messages USING btree (session_id, created_at, id)`
- `chat_messages_pkey`: `CREATE UNIQUE INDEX chat_messages_pkey ON public.chat_messages USING btree (id)`
- `chat_messages_sender_idx`: `CREATE INDEX chat_messages_sender_idx ON public.chat_messages USING btree (sender_id)`
- `chat_messages_session_id_sender_id_client_message_id_key`: `CREATE UNIQUE INDEX chat_messages_session_id_sender_id_client_message_id_key ON public.chat_messages USING btree (session_id, sender_id, client_message_id)`

## public.feedback_releases

Tutor release marker for derived automatic task feedback.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| session_item_id | uuid | NO | — | Reference to session item. |
| released_at | timestamp with time zone | NO | now() | Tutor release time; NULL means feedback is not released. |

Constraints:

- `feedback_releases_pkey`: `PRIMARY KEY (session_item_id)`
- `feedback_releases_released_at_not_null`: `NOT NULL released_at`
- `feedback_releases_session_item_id_fkey`: `FOREIGN KEY (session_item_id) REFERENCES session_items(id)`
- `feedback_releases_session_item_id_not_null`: `NOT NULL session_item_id`

Indexes (including PK/unique enforcement):

- `feedback_releases_pkey`: `CREATE UNIQUE INDEX feedback_releases_pkey ON public.feedback_releases USING btree (session_item_id)`

## public.homework_assignments

Homework assigned to a tutor/student relationship.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | Stable UUID identifier. |
| tutor_student_id | uuid | NO | — | Reference to tutor student. |
| title | character varying(200) | NO | — | Non-empty human-readable title. |
| due_at | timestamp with time zone | YES | — | Optional homework deadline. |
| created_at | timestamp with time zone | NO | now() | Record creation time. |

Constraints:

- `homework_assignments_created_at_not_null`: `NOT NULL created_at`
- `homework_assignments_id_not_null`: `NOT NULL id`
- `homework_assignments_pkey`: `PRIMARY KEY (id)`
- `homework_assignments_title_check`: `CHECK ((btrim((title)::text) <> ''::text))`
- `homework_assignments_title_not_null`: `NOT NULL title`
- `homework_assignments_tutor_student_id_fkey`: `FOREIGN KEY (tutor_student_id) REFERENCES tutor_students(id)`
- `homework_assignments_tutor_student_id_not_null`: `NOT NULL tutor_student_id`

Indexes (including PK/unique enforcement):

- `homework_assignments_due_idx`: `CREATE INDEX homework_assignments_due_idx ON public.homework_assignments USING btree (due_at) WHERE (due_at IS NOT NULL)`
- `homework_assignments_list_idx`: `CREATE INDEX homework_assignments_list_idx ON public.homework_assignments USING btree (tutor_student_id, created_at DESC)`
- `homework_assignments_pkey`: `CREATE UNIQUE INDEX homework_assignments_pkey ON public.homework_assignments USING btree (id)`

## public.homework_feedback_comments

Immutable tutor comments on submitted homework answers.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | Stable UUID identifier. |
| response_revision_id | uuid | NO | — | Reference to response revision. |
| comment | text | NO | — | Non-empty tutor feedback text. |
| created_at | timestamp with time zone | NO | now() | Record creation time. |

Constraints:

- `homework_feedback_comments_comment_check`: `CHECK ((btrim(comment) <> ''::text))`
- `homework_feedback_comments_comment_not_null`: `NOT NULL comment`
- `homework_feedback_comments_created_at_not_null`: `NOT NULL created_at`
- `homework_feedback_comments_id_not_null`: `NOT NULL id`
- `homework_feedback_comments_pkey`: `PRIMARY KEY (id)`
- `homework_feedback_comments_response_revision_id_fkey`: `FOREIGN KEY (response_revision_id) REFERENCES response_revisions(id)`
- `homework_feedback_comments_response_revision_id_not_null`: `NOT NULL response_revision_id`

Indexes (including PK/unique enforcement):

- `homework_feedback_comments_pkey`: `CREATE UNIQUE INDEX homework_feedback_comments_pkey ON public.homework_feedback_comments USING btree (id)`
- `homework_feedback_revision_idx`: `CREATE INDEX homework_feedback_revision_idx ON public.homework_feedback_comments USING btree (response_revision_id, created_at DESC)`

## public.homework_items

Ordered published task versions assigned as homework.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | Stable UUID identifier. |
| assignment_id | uuid | NO | — | Reference to assignment. |
| task_version_id | uuid | NO | — | Reference to task version. |
| position | integer | NO | — | Positive order within the parent collection. |

Constraints:

- `homework_items_assignment_id_fkey`: `FOREIGN KEY (assignment_id) REFERENCES homework_assignments(id)`
- `homework_items_assignment_id_not_null`: `NOT NULL assignment_id`
- `homework_items_assignment_id_position_key`: `UNIQUE (assignment_id, "position")`
- `homework_items_id_not_null`: `NOT NULL id`
- `homework_items_pkey`: `PRIMARY KEY (id)`
- `homework_items_position_check`: `CHECK (("position" > 0))`
- `homework_items_position_not_null`: `NOT NULL "position"`
- `homework_items_task_version_id_fkey`: `FOREIGN KEY (task_version_id) REFERENCES task_versions(id)`
- `homework_items_task_version_id_not_null`: `NOT NULL task_version_id`

Indexes (including PK/unique enforcement):

- `homework_items_assignment_id_position_key`: `CREATE UNIQUE INDEX homework_items_assignment_id_position_key ON public.homework_items USING btree (assignment_id, "position")`
- `homework_items_pkey`: `CREATE UNIQUE INDEX homework_items_pkey ON public.homework_items USING btree (id)`
- `homework_items_version_idx`: `CREATE INDEX homework_items_version_idx ON public.homework_items USING btree (task_version_id)`

## public.homework_revisions

Independent answer attempts, with submission and return transitions.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | Stable UUID identifier. |
| assignment_id | uuid | NO | — | Reference to assignment. |
| revision_no | integer | NO | — | Positive consecutive answer/homework revision number. |
| created_at | timestamp with time zone | NO | now() | Record creation time. |
| submitted_at | timestamp with time zone | YES | — | Homework submission time; answers become immutable. |
| returned_at | timestamp with time zone | YES | — | Time tutor requested a new homework attempt. |
| return_note | text | YES | — | Non-empty explanation accompanying a returned submission. |

Constraints:

- `homework_revisions_assignment_id_fkey`: `FOREIGN KEY (assignment_id) REFERENCES homework_assignments(id)`
- `homework_revisions_assignment_id_not_null`: `NOT NULL assignment_id`
- `homework_revisions_assignment_id_revision_no_key`: `UNIQUE (assignment_id, revision_no)`
- `homework_revisions_check`: `CHECK (((submitted_at IS NULL) OR (submitted_at >= created_at)))`
- `homework_revisions_check1`: `CHECK ((((returned_at IS NULL) AND (return_note IS NULL)) OR ((submitted_at IS NOT NULL) AND (returned_at IS NOT NULL) AND (return_note IS NOT NULL) AND (returned_at >= submitted_at) AND (btrim(return_note) <> ''::text))))`
- `homework_revisions_created_at_not_null`: `NOT NULL created_at`
- `homework_revisions_id_not_null`: `NOT NULL id`
- `homework_revisions_pkey`: `PRIMARY KEY (id)`
- `homework_revisions_revision_no_check`: `CHECK ((revision_no > 0))`
- `homework_revisions_revision_no_not_null`: `NOT NULL revision_no`
- `homework_submission_complete`: `TRIGGER DEFERRABLE INITIALLY DEFERRED`

Indexes (including PK/unique enforcement):

- `homework_revisions_assignment_id_revision_no_key`: `CREATE UNIQUE INDEX homework_revisions_assignment_id_revision_no_key ON public.homework_revisions USING btree (assignment_id, revision_no)`
- `homework_revisions_one_draft`: `CREATE UNIQUE INDEX homework_revisions_one_draft ON public.homework_revisions USING btree (assignment_id) WHERE (submitted_at IS NULL)`
- `homework_revisions_pkey`: `CREATE UNIQUE INDEX homework_revisions_pkey ON public.homework_revisions USING btree (id)`
- `homework_revisions_submission_idx`: `CREATE INDEX homework_revisions_submission_idx ON public.homework_revisions USING btree (submitted_at) WHERE (submitted_at IS NOT NULL)`

## public.input_kinds

Renderer and answer representation for an individual input.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| code | text | NO | — | Stable lookup code used by foreign keys. |
| label | text | NO | — | Human-readable label. |

Constraints:

- `input_kinds_code_not_null`: `NOT NULL code`
- `input_kinds_label_key`: `UNIQUE (label)`
- `input_kinds_label_not_null`: `NOT NULL label`
- `input_kinds_pkey`: `PRIMARY KEY (code)`

Indexes (including PK/unique enforcement):

- `input_kinds_label_key`: `CREATE UNIQUE INDEX input_kinds_label_key ON public.input_kinds USING btree (label)`
- `input_kinds_pkey`: `CREATE UNIQUE INDEX input_kinds_pkey ON public.input_kinds USING btree (code)`

## public.lesson_item_kinds

Allowed lesson block payload types.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| code | text | NO | — | Stable lookup code used by foreign keys. |
| label | text | NO | — | Human-readable label. |

Constraints:

- `lesson_item_kinds_code_not_null`: `NOT NULL code`
- `lesson_item_kinds_label_key`: `UNIQUE (label)`
- `lesson_item_kinds_label_not_null`: `NOT NULL label`
- `lesson_item_kinds_pkey`: `PRIMARY KEY (code)`

Indexes (including PK/unique enforcement):

- `lesson_item_kinds_label_key`: `CREATE UNIQUE INDEX lesson_item_kinds_label_key ON public.lesson_item_kinds USING btree (label)`
- `lesson_item_kinds_pkey`: `CREATE UNIQUE INDEX lesson_item_kinds_pkey ON public.lesson_item_kinds USING btree (code)`

## public.lesson_items

Ordered lesson blocks with exactly one payload.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | Stable UUID identifier. |
| lesson_version_id | uuid | NO | — | Reference to lesson version. |
| position | integer | NO | — | Positive order within the parent collection. |
| kind_code | text | NO | — | Allowed payload or input representation. |
| text_content | text | YES | — | Lesson text block payload. |
| asset_id | uuid | YES | — | Reference to asset. |
| link_url | text | YES | — | HTTPS external learning-resource URL. |
| task_version_id | uuid | YES | — | Reference to task version. |

Constraints:

- `lesson_items_asset_id_fkey`: `FOREIGN KEY (asset_id) REFERENCES assets(id)`
- `lesson_items_check`: `CHECK ((num_nonnulls(text_content, asset_id, link_url, task_version_id) = 1))`
- `lesson_items_check1`: `CHECK ((((kind_code = 'text'::text) AND (text_content IS NOT NULL) AND (btrim(text_content) <> ''::text)) OR ((kind_code = 'image'::text) AND (asset_id IS NOT NULL)) OR ((kind_code = 'link'::text) AND (link_url IS NOT NULL) AND (link_url ~ '^https://[^[:space:]]+$'::text)) OR ((kind_code = 'task'::text) AND (task_version_id IS NOT NULL))))`
- `lesson_items_id_not_null`: `NOT NULL id`
- `lesson_items_kind_code_fkey`: `FOREIGN KEY (kind_code) REFERENCES lesson_item_kinds(code)`
- `lesson_items_kind_code_not_null`: `NOT NULL kind_code`
- `lesson_items_lesson_version_id_fkey`: `FOREIGN KEY (lesson_version_id) REFERENCES lesson_versions(id)`
- `lesson_items_lesson_version_id_not_null`: `NOT NULL lesson_version_id`
- `lesson_items_lesson_version_id_position_key`: `UNIQUE (lesson_version_id, "position")`
- `lesson_items_pkey`: `PRIMARY KEY (id)`
- `lesson_items_position_check`: `CHECK (("position" > 0))`
- `lesson_items_position_not_null`: `NOT NULL "position"`
- `lesson_items_task_version_id_fkey`: `FOREIGN KEY (task_version_id) REFERENCES task_versions(id)`

Indexes (including PK/unique enforcement):

- `lesson_items_asset_idx`: `CREATE INDEX lesson_items_asset_idx ON public.lesson_items USING btree (asset_id)`
- `lesson_items_lesson_version_id_position_key`: `CREATE UNIQUE INDEX lesson_items_lesson_version_id_position_key ON public.lesson_items USING btree (lesson_version_id, "position")`
- `lesson_items_pkey`: `CREATE UNIQUE INDEX lesson_items_pkey ON public.lesson_items USING btree (id)`
- `lesson_items_task_idx`: `CREATE INDEX lesson_items_task_idx ON public.lesson_items USING btree (task_version_id)`

## public.lesson_notifications

Creation-only lesson notification; unread status disappears after reading.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| session_id | uuid | NO | — | Reference to session. |
| read_at | timestamp with time zone | YES | — | First-read time; NULL means unread. |

Constraints:

- `lesson_notifications_pkey`: `PRIMARY KEY (session_id)`
- `lesson_notifications_session_id_fkey`: `FOREIGN KEY (session_id) REFERENCES sessions(id)`
- `lesson_notifications_session_id_not_null`: `NOT NULL session_id`

Indexes (including PK/unique enforcement):

- `lesson_notifications_pkey`: `CREATE UNIQUE INDEX lesson_notifications_pkey ON public.lesson_notifications USING btree (session_id)`

## public.lesson_versions

Draft or immutable published ordered lesson definition.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | Stable UUID identifier. |
| lesson_id | uuid | NO | — | Reference to lesson. |
| version_no | integer | NO | — | Positive content version number within its parent. |
| title | character varying(200) | NO | — | Non-empty human-readable title. |
| published_at | timestamp with time zone | YES | — | Publication time; NULL identifies an editable draft. |
| created_at | timestamp with time zone | NO | now() | Record creation time. |

Constraints:

- `lesson_versions_created_at_not_null`: `NOT NULL created_at`
- `lesson_versions_id_not_null`: `NOT NULL id`
- `lesson_versions_lesson_id_fkey`: `FOREIGN KEY (lesson_id) REFERENCES lessons(id)`
- `lesson_versions_lesson_id_not_null`: `NOT NULL lesson_id`
- `lesson_versions_lesson_id_version_no_key`: `UNIQUE (lesson_id, version_no)`
- `lesson_versions_pkey`: `PRIMARY KEY (id)`
- `lesson_versions_title_check`: `CHECK ((btrim((title)::text) <> ''::text))`
- `lesson_versions_title_not_null`: `NOT NULL title`
- `lesson_versions_version_no_check`: `CHECK ((version_no > 0))`
- `lesson_versions_version_no_not_null`: `NOT NULL version_no`

Indexes (including PK/unique enforcement):

- `lesson_versions_lesson_id_version_no_key`: `CREATE UNIQUE INDEX lesson_versions_lesson_id_version_no_key ON public.lesson_versions USING btree (lesson_id, version_no)`
- `lesson_versions_pkey`: `CREATE UNIQUE INDEX lesson_versions_pkey ON public.lesson_versions USING btree (id)`

## public.lessons

Stable reusable lesson identity.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | Stable UUID identifier. |
| owner_id | uuid | NO | — | Reference to owner. |
| archived_at | timestamp with time zone | YES | — | Archive marker for reusable content. |
| created_at | timestamp with time zone | NO | now() | Record creation time. |

Constraints:

- `lessons_created_at_not_null`: `NOT NULL created_at`
- `lessons_id_not_null`: `NOT NULL id`
- `lessons_owner_id_fkey`: `FOREIGN KEY (owner_id) REFERENCES users(id)`
- `lessons_owner_id_not_null`: `NOT NULL owner_id`
- `lessons_pkey`: `PRIMARY KEY (id)`

Indexes (including PK/unique enforcement):

- `lessons_owner_library_idx`: `CREATE INDEX lessons_owner_library_idx ON public.lessons USING btree (owner_id, archived_at, created_at DESC)`
- `lessons_pkey`: `CREATE UNIQUE INDEX lessons_pkey ON public.lessons USING btree (id)`

## public.live_feedback_comments

Tutor comments tied to the exact live answer reviewed; release controlled by tutor.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | Stable UUID identifier. |
| response_revision_id | uuid | NO | — | Reference to response revision. |
| comment | text | NO | — | Non-empty tutor feedback text. |
| created_at | timestamp with time zone | NO | now() | Record creation time. |
| released_at | timestamp with time zone | YES | — | Tutor release time; NULL means feedback is not released. |

Constraints:

- `live_feedback_comments_comment_check`: `CHECK ((btrim(comment) <> ''::text))`
- `live_feedback_comments_comment_not_null`: `NOT NULL comment`
- `live_feedback_comments_created_at_not_null`: `NOT NULL created_at`
- `live_feedback_comments_id_not_null`: `NOT NULL id`
- `live_feedback_comments_pkey`: `PRIMARY KEY (id)`
- `live_feedback_comments_response_revision_id_fkey`: `FOREIGN KEY (response_revision_id) REFERENCES response_revisions(id)`
- `live_feedback_comments_response_revision_id_not_null`: `NOT NULL response_revision_id`

Indexes (including PK/unique enforcement):

- `live_feedback_comments_pkey`: `CREATE UNIQUE INDEX live_feedback_comments_pkey ON public.live_feedback_comments USING btree (id)`
- `live_feedback_revision_idx`: `CREATE INDEX live_feedback_revision_idx ON public.live_feedback_comments USING btree (response_revision_id, created_at DESC)`

## public.response_choice_values

Relational selected choices or ordered tokens in one immutable answer revision.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| response_revision_id | uuid | NO | — | Reference to response revision. |
| choice_id | uuid | NO | — | Reference to choice. |
| position | integer | NO | — | Positive order within the parent collection. |

Constraints:

- `response_choice_values_choice_id_fkey`: `FOREIGN KEY (choice_id) REFERENCES task_choices(id)`
- `response_choice_values_choice_id_not_null`: `NOT NULL choice_id`
- `response_choice_values_pkey`: `PRIMARY KEY (response_revision_id, "position")`
- `response_choice_values_position_check`: `CHECK (("position" > 0))`
- `response_choice_values_position_not_null`: `NOT NULL "position"`
- `response_choice_values_response_revision_id_choice_id_key`: `UNIQUE (response_revision_id, choice_id)`
- `response_choice_values_response_revision_id_fkey`: `FOREIGN KEY (response_revision_id) REFERENCES response_revisions(id)`
- `response_choice_values_response_revision_id_not_null`: `NOT NULL response_revision_id`
- `response_shape_after_choice`: `TRIGGER DEFERRABLE INITIALLY DEFERRED`

Indexes (including PK/unique enforcement):

- `response_choice_values_choice_idx`: `CREATE INDEX response_choice_values_choice_idx ON public.response_choice_values USING btree (choice_id)`
- `response_choice_values_pkey`: `CREATE UNIQUE INDEX response_choice_values_pkey ON public.response_choice_values USING btree (response_revision_id, "position")`
- `response_choice_values_response_revision_id_choice_id_key`: `CREATE UNIQUE INDEX response_choice_values_response_revision_id_choice_id_key ON public.response_choice_values USING btree (response_revision_id, choice_id)`

## public.response_revisions

Append-only confirmed answer edits, ordered within a response stream.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | Stable UUID identifier. |
| response_id | uuid | NO | — | Reference to response. |
| revision_no | integer | NO | — | Positive consecutive answer/homework revision number. |
| client_event_id | uuid | NO | — | Client retry identifier, unique within one response stream. |
| text_value | text | YES | — | Saved text answer; NULL for choice-based answers. |
| write_transaction | bigint | NO | ((pg_current_xact_id())::text)::bigint | Internal transaction ID enforcing atomic insertion of selected choices. |
| created_at | timestamp with time zone | NO | now() | Record creation time. |

Constraints:

- `response_revisions_client_event_id_not_null`: `NOT NULL client_event_id`
- `response_revisions_created_at_not_null`: `NOT NULL created_at`
- `response_revisions_id_not_null`: `NOT NULL id`
- `response_revisions_pkey`: `PRIMARY KEY (id)`
- `response_revisions_response_id_client_event_id_key`: `UNIQUE (response_id, client_event_id)`
- `response_revisions_response_id_fkey`: `FOREIGN KEY (response_id) REFERENCES responses(id)`
- `response_revisions_response_id_not_null`: `NOT NULL response_id`
- `response_revisions_response_id_revision_no_key`: `UNIQUE (response_id, revision_no)`
- `response_revisions_revision_no_check`: `CHECK ((revision_no > 0))`
- `response_revisions_revision_no_not_null`: `NOT NULL revision_no`
- `response_revisions_write_transaction_not_null`: `NOT NULL write_transaction`
- `response_shape_after_revision`: `TRIGGER DEFERRABLE INITIALLY DEFERRED`

Indexes (including PK/unique enforcement):

- `response_revisions_pkey`: `CREATE UNIQUE INDEX response_revisions_pkey ON public.response_revisions USING btree (id)`
- `response_revisions_response_id_client_event_id_key`: `CREATE UNIQUE INDEX response_revisions_response_id_client_event_id_key ON public.response_revisions USING btree (response_id, client_event_id)`
- `response_revisions_response_id_revision_no_key`: `CREATE UNIQUE INDEX response_revisions_response_id_revision_no_key ON public.response_revisions USING btree (response_id, revision_no)`

## public.responses

One response stream for an input in exactly one live or homework context.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | Stable UUID identifier. |
| input_id | uuid | NO | — | Reference to input. |
| session_item_id | uuid | YES | — | Reference to session item. |
| homework_revision_id | uuid | YES | — | Reference to homework revision. |
| homework_item_id | uuid | YES | — | Reference to homework item. |

Constraints:

- `responses_check`: `CHECK ((((session_item_id IS NOT NULL) AND (homework_revision_id IS NULL) AND (homework_item_id IS NULL)) OR ((session_item_id IS NULL) AND (homework_revision_id IS NOT NULL) AND (homework_item_id IS NOT NULL))))`
- `responses_homework_item_id_fkey`: `FOREIGN KEY (homework_item_id) REFERENCES homework_items(id)`
- `responses_homework_revision_id_fkey`: `FOREIGN KEY (homework_revision_id) REFERENCES homework_revisions(id)`
- `responses_id_not_null`: `NOT NULL id`
- `responses_input_id_fkey`: `FOREIGN KEY (input_id) REFERENCES task_inputs(id)`
- `responses_input_id_not_null`: `NOT NULL input_id`
- `responses_pkey`: `PRIMARY KEY (id)`
- `responses_session_item_id_fkey`: `FOREIGN KEY (session_item_id) REFERENCES session_items(id)`

Indexes (including PK/unique enforcement):

- `responses_homework_input_key`: `CREATE UNIQUE INDEX responses_homework_input_key ON public.responses USING btree (homework_revision_id, homework_item_id, input_id) WHERE (homework_revision_id IS NOT NULL)`
- `responses_homework_item_idx`: `CREATE INDEX responses_homework_item_idx ON public.responses USING btree (homework_item_id)`
- `responses_input_idx`: `CREATE INDEX responses_input_idx ON public.responses USING btree (input_id)`
- `responses_live_input_key`: `CREATE UNIQUE INDEX responses_live_input_key ON public.responses USING btree (session_item_id, input_id) WHERE (session_item_id IS NOT NULL)`
- `responses_pkey`: `CREATE UNIQUE INDEX responses_pkey ON public.responses USING btree (id)`

## public.roles

Fixed application profile types; these are separate from PostgreSQL login roles.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| code | text | NO | — | Stable lookup code used by foreign keys. |
| label | text | NO | — | Human-readable label. |

Constraints:

- `roles_code_not_null`: `NOT NULL code`
- `roles_label_key`: `UNIQUE (label)`
- `roles_label_not_null`: `NOT NULL label`
- `roles_pkey`: `PRIMARY KEY (code)`

Indexes (including PK/unique enforcement):

- `roles_label_key`: `CREATE UNIQUE INDEX roles_label_key ON public.roles USING btree (label)`
- `roles_pkey`: `CREATE UNIQUE INDEX roles_pkey ON public.roles USING btree (code)`

## public.session_active_items

At most one currently active revealed item per session.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| session_id | uuid | NO | — | Reference to session. |
| session_item_id | uuid | NO | — | Reference to session item. |

Constraints:

- `session_active_items_pkey`: `PRIMARY KEY (session_id)`
- `session_active_items_session_id_fkey`: `FOREIGN KEY (session_id) REFERENCES sessions(id)`
- `session_active_items_session_id_not_null`: `NOT NULL session_id`
- `session_active_items_session_item_id_fkey`: `FOREIGN KEY (session_item_id) REFERENCES session_items(id)`
- `session_active_items_session_item_id_key`: `UNIQUE (session_item_id)`
- `session_active_items_session_item_id_not_null`: `NOT NULL session_item_id`

Indexes (including PK/unique enforcement):

- `session_active_items_pkey`: `CREATE UNIQUE INDEX session_active_items_pkey ON public.session_active_items USING btree (session_id)`
- `session_active_items_session_item_id_key`: `CREATE UNIQUE INDEX session_active_items_session_item_id_key ON public.session_active_items USING btree (session_item_id)`

## public.session_content

Published lesson version pinned exactly once at session start.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| session_id | uuid | NO | — | Reference to session. |
| lesson_version_id | uuid | NO | — | Reference to lesson version. |
| pinned_at | timestamp with time zone | NO | now() | Time the published lesson version was fixed for this session. |

Constraints:

- `session_content_lesson_version_id_fkey`: `FOREIGN KEY (lesson_version_id) REFERENCES lesson_versions(id)`
- `session_content_lesson_version_id_not_null`: `NOT NULL lesson_version_id`
- `session_content_pinned_at_not_null`: `NOT NULL pinned_at`
- `session_content_pkey`: `PRIMARY KEY (session_id)`
- `session_content_session_id_fkey`: `FOREIGN KEY (session_id) REFERENCES sessions(id)`
- `session_content_session_id_not_null`: `NOT NULL session_id`

Indexes (including PK/unique enforcement):

- `session_content_pkey`: `CREATE UNIQUE INDEX session_content_pkey ON public.session_content USING btree (session_id)`
- `session_content_version_idx`: `CREATE INDEX session_content_version_idx ON public.session_content USING btree (lesson_version_id)`

## public.session_items

Items revealed by the tutor in a particular session.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | Stable UUID identifier. |
| session_id | uuid | NO | — | Reference to session. |
| lesson_item_id | uuid | NO | — | Reference to lesson item. |
| revealed_at | timestamp with time zone | NO | now() | Time tutor exposed the item. |

Constraints:

- `session_items_id_not_null`: `NOT NULL id`
- `session_items_lesson_item_id_fkey`: `FOREIGN KEY (lesson_item_id) REFERENCES lesson_items(id)`
- `session_items_lesson_item_id_not_null`: `NOT NULL lesson_item_id`
- `session_items_pkey`: `PRIMARY KEY (id)`
- `session_items_revealed_at_not_null`: `NOT NULL revealed_at`
- `session_items_session_id_fkey`: `FOREIGN KEY (session_id) REFERENCES session_content(session_id)`
- `session_items_session_id_lesson_item_id_key`: `UNIQUE (session_id, lesson_item_id)`
- `session_items_session_id_not_null`: `NOT NULL session_id`

Indexes (including PK/unique enforcement):

- `session_items_lesson_item_idx`: `CREATE INDEX session_items_lesson_item_idx ON public.session_items USING btree (lesson_item_id)`
- `session_items_pkey`: `CREATE UNIQUE INDEX session_items_pkey ON public.session_items USING btree (id)`
- `session_items_session_id_lesson_item_id_key`: `CREATE UNIQUE INDEX session_items_session_id_lesson_item_id_key ON public.session_items USING btree (session_id, lesson_item_id)`

## public.session_states

Allowed lesson session lifecycle states.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| code | text | NO | — | Stable lookup code used by foreign keys. |
| label | text | NO | — | Human-readable label. |

Constraints:

- `session_states_code_not_null`: `NOT NULL code`
- `session_states_label_key`: `UNIQUE (label)`
- `session_states_label_not_null`: `NOT NULL label`
- `session_states_pkey`: `PRIMARY KEY (code)`

Indexes (including PK/unique enforcement):

- `session_states_label_key`: `CREATE UNIQUE INDEX session_states_label_key ON public.session_states USING btree (label)`
- `session_states_pkey`: `CREATE UNIQUE INDEX session_states_pkey ON public.session_states USING btree (code)`

## public.sessions

Scheduled, active, ended or cancelled one-to-one lesson occurrence.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | Stable UUID identifier. |
| tutor_student_id | uuid | NO | — | Reference to tutor student. |
| planned_lesson_id | uuid | NO | — | Reference to planned lesson. |
| scheduled_start | timestamp with time zone | NO | — | Scheduled session start instant. |
| duration_minutes | integer | NO | — | Positive planned duration; scheduled end is derived. |
| state_code | text | NO | 'scheduled'::text | Session lifecycle state. |
| started_at | timestamp with time zone | YES | — | Actual session start time. |
| ended_at | timestamp with time zone | YES | — | Actual session end or relationship closure time. |
| cancelled_at | timestamp with time zone | YES | — | Session cancellation time. |
| created_at | timestamp with time zone | NO | now() | Record creation time. |

Constraints:

- `sessions_check`: `CHECK ((((state_code = 'scheduled'::text) AND (num_nonnulls(started_at, ended_at, cancelled_at) = 0)) OR ((state_code = 'active'::text) AND (started_at IS NOT NULL) AND (ended_at IS NULL) AND (cancelled_at IS NULL)) OR ((state_code = 'ended'::text) AND (started_at IS NOT NULL) AND (ended_at IS NOT NULL) AND (ended_at >= started_at) AND (cancelled_at IS NULL)) OR ((state_code = 'cancelled'::text) AND (cancelled_at IS NOT NULL) AND (started_at IS NULL) AND (ended_at IS NULL))))`
- `sessions_created_at_not_null`: `NOT NULL created_at`
- `sessions_duration_minutes_check`: `CHECK ((duration_minutes > 0))`
- `sessions_duration_minutes_not_null`: `NOT NULL duration_minutes`
- `sessions_id_not_null`: `NOT NULL id`
- `sessions_pkey`: `PRIMARY KEY (id)`
- `sessions_planned_lesson_id_fkey`: `FOREIGN KEY (planned_lesson_id) REFERENCES lessons(id)`
- `sessions_planned_lesson_id_not_null`: `NOT NULL planned_lesson_id`
- `sessions_scheduled_start_not_null`: `NOT NULL scheduled_start`
- `sessions_state_code_fkey`: `FOREIGN KEY (state_code) REFERENCES session_states(code)`
- `sessions_state_code_not_null`: `NOT NULL state_code`
- `sessions_tutor_student_id_fkey`: `FOREIGN KEY (tutor_student_id) REFERENCES tutor_students(id)`
- `sessions_tutor_student_id_not_null`: `NOT NULL tutor_student_id`

Indexes (including PK/unique enforcement):

- `sessions_history_idx`: `CREATE INDEX sessions_history_idx ON public.sessions USING btree (tutor_student_id, ended_at DESC) WHERE (state_code = ANY (ARRAY['ended'::text, 'cancelled'::text]))`
- `sessions_lesson_idx`: `CREATE INDEX sessions_lesson_idx ON public.sessions USING btree (planned_lesson_id)`
- `sessions_pkey`: `CREATE UNIQUE INDEX sessions_pkey ON public.sessions USING btree (id)`
- `sessions_schedule_idx`: `CREATE INDEX sessions_schedule_idx ON public.sessions USING btree (tutor_student_id, scheduled_start DESC)`

## public.task_choices

Distinct choice/token identities in a task version.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | Stable UUID identifier. |
| task_version_id | uuid | NO | — | Reference to task version. |
| position | integer | NO | — | Positive order within the parent collection. |
| label | text | NO | — | Human-readable label. |

Constraints:

- `task_choices_id_not_null`: `NOT NULL id`
- `task_choices_label_check`: `CHECK ((btrim(label) <> ''::text))`
- `task_choices_label_not_null`: `NOT NULL label`
- `task_choices_pkey`: `PRIMARY KEY (id)`
- `task_choices_position_check`: `CHECK (("position" > 0))`
- `task_choices_position_not_null`: `NOT NULL "position"`
- `task_choices_task_version_id_fkey`: `FOREIGN KEY (task_version_id) REFERENCES task_versions(id)`
- `task_choices_task_version_id_not_null`: `NOT NULL task_version_id`
- `task_choices_task_version_id_position_key`: `UNIQUE (task_version_id, "position")`

Indexes (including PK/unique enforcement):

- `task_choices_pkey`: `CREATE UNIQUE INDEX task_choices_pkey ON public.task_choices USING btree (id)`
- `task_choices_task_version_id_position_key`: `CREATE UNIQUE INDEX task_choices_task_version_id_position_key ON public.task_choices USING btree (task_version_id, "position")`

## public.task_input_choices

Allowed input/choice pairs within one task version.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| input_id | uuid | NO | — | Reference to input. |
| choice_id | uuid | NO | — | Reference to choice. |

Constraints:

- `task_input_choices_choice_id_fkey`: `FOREIGN KEY (choice_id) REFERENCES task_choices(id)`
- `task_input_choices_choice_id_not_null`: `NOT NULL choice_id`
- `task_input_choices_input_id_fkey`: `FOREIGN KEY (input_id) REFERENCES task_inputs(id)`
- `task_input_choices_input_id_not_null`: `NOT NULL input_id`
- `task_input_choices_pkey`: `PRIMARY KEY (input_id, choice_id)`

Indexes (including PK/unique enforcement):

- `task_input_choices_choice_idx`: `CREATE INDEX task_input_choices_choice_idx ON public.task_input_choices USING btree (choice_id)`
- `task_input_choices_pkey`: `CREATE UNIQUE INDEX task_input_choices_pkey ON public.task_input_choices USING btree (input_id, choice_id)`

## public.task_inputs

Individual blank, question, matching item, ordering slot or image marker.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | Stable UUID identifier. |
| task_version_id | uuid | NO | — | Reference to task version. |
| position | integer | NO | — | Positive order within the parent collection. |
| kind_code | text | NO | — | Allowed payload or input representation. |
| label | text | NO | — | Human-readable label. |
| required | boolean | NO | true | Whether an answer is required for progress/submission. |
| marker_x | numeric | YES | — | Horizontal image marker coordinate, percentage 0–100. |
| marker_y | numeric | YES | — | Vertical image marker coordinate, percentage 0–100. |

Constraints:

- `task_inputs_check`: `CHECK (((marker_x IS NULL) = (marker_y IS NULL)))`
- `task_inputs_check1`: `CHECK ((((marker_x >= (0)::numeric) AND (marker_x <= (100)::numeric)) AND ((marker_y >= (0)::numeric) AND (marker_y <= (100)::numeric))))`
- `task_inputs_id_not_null`: `NOT NULL id`
- `task_inputs_kind_code_fkey`: `FOREIGN KEY (kind_code) REFERENCES input_kinds(code)`
- `task_inputs_kind_code_not_null`: `NOT NULL kind_code`
- `task_inputs_label_check`: `CHECK ((btrim(label) <> ''::text))`
- `task_inputs_label_not_null`: `NOT NULL label`
- `task_inputs_pkey`: `PRIMARY KEY (id)`
- `task_inputs_position_check`: `CHECK (("position" > 0))`
- `task_inputs_position_not_null`: `NOT NULL "position"`
- `task_inputs_required_not_null`: `NOT NULL required`
- `task_inputs_task_version_id_fkey`: `FOREIGN KEY (task_version_id) REFERENCES task_versions(id)`
- `task_inputs_task_version_id_not_null`: `NOT NULL task_version_id`
- `task_inputs_task_version_id_position_key`: `UNIQUE (task_version_id, "position")`

Indexes (including PK/unique enforcement):

- `task_inputs_pkey`: `CREATE UNIQUE INDEX task_inputs_pkey ON public.task_inputs USING btree (id)`
- `task_inputs_task_version_id_position_key`: `CREATE UNIQUE INDEX task_inputs_task_version_id_position_key ON public.task_inputs USING btree (task_version_id, "position")`

## public.task_types

Ten supported task formats and their automatic/manual checking mode.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| code | text | NO | — | Stable lookup code used by foreign keys. |
| label | text | NO | — | Human-readable label. |
| checking_mode | text | NO | — | Automatic comparison or manual tutor review. |

Constraints:

- `task_types_checking_mode_check`: `CHECK ((checking_mode = ANY (ARRAY['automatic'::text, 'manual'::text])))`
- `task_types_checking_mode_not_null`: `NOT NULL checking_mode`
- `task_types_code_not_null`: `NOT NULL code`
- `task_types_label_key`: `UNIQUE (label)`
- `task_types_label_not_null`: `NOT NULL label`
- `task_types_pkey`: `PRIMARY KEY (code)`

Indexes (including PK/unique enforcement):

- `task_types_label_key`: `CREATE UNIQUE INDEX task_types_label_key ON public.task_types USING btree (label)`
- `task_types_pkey`: `CREATE UNIQUE INDEX task_types_pkey ON public.task_types USING btree (code)`

## public.task_versions

Draft or immutable published task definition.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | Stable UUID identifier. |
| task_id | uuid | NO | — | Reference to task. |
| version_no | integer | NO | — | Positive content version number within its parent. |
| type_code | text | NO | — | Task format lookup reference. |
| title | character varying(200) | NO | — | Non-empty human-readable title. |
| prompt | text | NO | — | Task instructions shown to the learner. |
| image_asset_id | uuid | YES | — | Reference to image asset. |
| published_at | timestamp with time zone | YES | — | Publication time; NULL identifies an editable draft. |
| created_at | timestamp with time zone | NO | now() | Record creation time. |
| passage | text | YES | — | Versioned fill-in-the-blanks text with numbered markers. NULL for legacy versions and other formats. |

Constraints:

- `task_versions_check`: `CHECK (((type_code = 'image_labeling'::text) = (image_asset_id IS NOT NULL)))`
- `task_versions_created_at_not_null`: `NOT NULL created_at`
- `task_versions_id_not_null`: `NOT NULL id`
- `task_versions_image_asset_id_fkey`: `FOREIGN KEY (image_asset_id) REFERENCES assets(id)`
- `task_versions_passage_check`: `CHECK (((passage IS NULL) OR ((type_code = 'fill_blanks'::text) AND (btrim(passage) <> ''::text))))`
- `task_versions_pkey`: `PRIMARY KEY (id)`
- `task_versions_prompt_check`: `CHECK ((btrim(prompt) <> ''::text))`
- `task_versions_prompt_not_null`: `NOT NULL prompt`
- `task_versions_task_id_fkey`: `FOREIGN KEY (task_id) REFERENCES tasks(id)`
- `task_versions_task_id_not_null`: `NOT NULL task_id`
- `task_versions_task_id_version_no_key`: `UNIQUE (task_id, version_no)`
- `task_versions_title_check`: `CHECK ((btrim((title)::text) <> ''::text))`
- `task_versions_title_not_null`: `NOT NULL title`
- `task_versions_type_code_fkey`: `FOREIGN KEY (type_code) REFERENCES task_types(code)`
- `task_versions_type_code_not_null`: `NOT NULL type_code`
- `task_versions_version_no_check`: `CHECK ((version_no > 0))`
- `task_versions_version_no_not_null`: `NOT NULL version_no`

Indexes (including PK/unique enforcement):

- `task_versions_image_idx`: `CREATE INDEX task_versions_image_idx ON public.task_versions USING btree (image_asset_id)`
- `task_versions_pkey`: `CREATE UNIQUE INDEX task_versions_pkey ON public.task_versions USING btree (id)`
- `task_versions_task_id_version_no_key`: `CREATE UNIQUE INDEX task_versions_task_id_version_no_key ON public.task_versions USING btree (task_id, version_no)`
- `task_versions_type_idx`: `CREATE INDEX task_versions_type_idx ON public.task_versions USING btree (type_code)`

## public.tasks

Stable reusable task identity owned by a tutor.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | Stable UUID identifier. |
| owner_id | uuid | NO | — | Reference to owner. |
| archived_at | timestamp with time zone | YES | — | Archive marker for reusable content. |
| created_at | timestamp with time zone | NO | now() | Record creation time. |

Constraints:

- `tasks_created_at_not_null`: `NOT NULL created_at`
- `tasks_id_not_null`: `NOT NULL id`
- `tasks_owner_id_fkey`: `FOREIGN KEY (owner_id) REFERENCES users(id)`
- `tasks_owner_id_not_null`: `NOT NULL owner_id`
- `tasks_pkey`: `PRIMARY KEY (id)`

Indexes (including PK/unique enforcement):

- `tasks_owner_library_idx`: `CREATE INDEX tasks_owner_library_idx ON public.tasks USING btree (owner_id, archived_at, created_at DESC)`
- `tasks_pkey`: `CREATE UNIQUE INDEX tasks_pkey ON public.tasks USING btree (id)`

## public.tutor_invitations

Hashed invitation tokens, expiry and acceptance/revocation outcome.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | Stable UUID identifier. |
| tutor_id | uuid | NO | — | Reference to tutor. |
| token_hash | character(64) | NO | — | SHA-256 hex digest of invitation token; never the raw token. |
| created_at | timestamp with time zone | NO | now() | Record creation time. |
| expires_at | timestamp with time zone | NO | — | Invitation or authentication rate-window expiry time, depending on the table. |
| revoked_at | timestamp with time zone | YES | — | Invitation revocation time. |
| accepted_student_id | uuid | YES | — | Reference to accepted student. |
| accepted_at | timestamp with time zone | YES | — | Invitation acceptance time. |

Constraints:

- `tutor_invitations_accepted_student_id_fkey`: `FOREIGN KEY (accepted_student_id) REFERENCES users(id)`
- `tutor_invitations_check`: `CHECK ((expires_at > created_at))`
- `tutor_invitations_check1`: `CHECK (((accepted_at IS NULL) = (accepted_student_id IS NULL)))`
- `tutor_invitations_check2`: `CHECK (((accepted_at IS NULL) OR ((accepted_at >= created_at) AND (accepted_at < expires_at))))`
- `tutor_invitations_created_at_not_null`: `NOT NULL created_at`
- `tutor_invitations_expires_at_not_null`: `NOT NULL expires_at`
- `tutor_invitations_id_not_null`: `NOT NULL id`
- `tutor_invitations_pkey`: `PRIMARY KEY (id)`
- `tutor_invitations_token_hash_check`: `CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))`
- `tutor_invitations_token_hash_key`: `UNIQUE (token_hash)`
- `tutor_invitations_token_hash_not_null`: `NOT NULL token_hash`
- `tutor_invitations_tutor_id_fkey`: `FOREIGN KEY (tutor_id) REFERENCES users(id)`
- `tutor_invitations_tutor_id_not_null`: `NOT NULL tutor_id`

Indexes (including PK/unique enforcement):

- `tutor_invitations_pkey`: `CREATE UNIQUE INDEX tutor_invitations_pkey ON public.tutor_invitations USING btree (id)`
- `tutor_invitations_student_idx`: `CREATE INDEX tutor_invitations_student_idx ON public.tutor_invitations USING btree (accepted_student_id)`
- `tutor_invitations_token_hash_key`: `CREATE UNIQUE INDEX tutor_invitations_token_hash_key ON public.tutor_invitations USING btree (token_hash)`
- `tutor_invitations_tutor_idx`: `CREATE INDEX tutor_invitations_tutor_idx ON public.tutor_invitations USING btree (tutor_id)`

## public.tutor_students

Historical one-to-one tutor/student links; at most one active tutor per student.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | Stable UUID identifier. |
| tutor_id | uuid | NO | — | Reference to tutor. |
| student_id | uuid | NO | — | Reference to student. |
| linked_at | timestamp with time zone | NO | now() | Time the tutor/student relationship started. |
| ended_at | timestamp with time zone | YES | — | Actual session end or relationship closure time. |

Constraints:

- `tutor_students_check`: `CHECK ((tutor_id <> student_id))`
- `tutor_students_check1`: `CHECK (((ended_at IS NULL) OR (ended_at >= linked_at)))`
- `tutor_students_id_not_null`: `NOT NULL id`
- `tutor_students_linked_at_not_null`: `NOT NULL linked_at`
- `tutor_students_pkey`: `PRIMARY KEY (id)`
- `tutor_students_student_id_fkey`: `FOREIGN KEY (student_id) REFERENCES users(id)`
- `tutor_students_student_id_not_null`: `NOT NULL student_id`
- `tutor_students_tutor_id_fkey`: `FOREIGN KEY (tutor_id) REFERENCES users(id)`
- `tutor_students_tutor_id_not_null`: `NOT NULL tutor_id`

Indexes (including PK/unique enforcement):

- `tutor_students_one_active_tutor`: `CREATE UNIQUE INDEX tutor_students_one_active_tutor ON public.tutor_students USING btree (student_id) WHERE (ended_at IS NULL)`
- `tutor_students_pkey`: `CREATE UNIQUE INDEX tutor_students_pkey ON public.tutor_students USING btree (id)`
- `tutor_students_student_idx`: `CREATE INDEX tutor_students_student_idx ON public.tutor_students USING btree (student_id)`
- `tutor_students_tutor_idx`: `CREATE INDEX tutor_students_tutor_idx ON public.tutor_students USING btree (tutor_id, ended_at)`

## public.users

Stable account identity, fixed profile role and retirement/authentication state.

| Column | PostgreSQL type | Nullable | Default | Meaning |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | Stable UUID identifier. |
| role_code | text | NO | — | Fixed tutor/student profile type. |
| timezone | text | NO | 'UTC'::text | Valid PostgreSQL/IANA timezone name. |
| auth_epoch | integer | NO | 0 | Authentication generation; incremented on retirement. |
| retired_at | timestamp with time zone | YES | — | Retirement time; NULL means the account is active. |
| created_at | timestamp with time zone | NO | now() | Record creation time. |
| updated_at | timestamp with time zone | NO | now() | Last account update time, maintained by trigger. |
| email | character varying(254) | NO | — | Trimmed lowercase login email; unique without case distinctions. |
| name | character varying(100) | NO | — | Required given name, 1–100 characters; anonymized on retirement. |
| lastname | character varying(100) | NO | — | Required family name, 1–100 characters; anonymized on retirement. |

Constraints:

- `users_auth_epoch_check`: `CHECK ((auth_epoch >= 0))`
- `users_auth_epoch_not_null`: `NOT NULL auth_epoch`
- `users_created_at_not_null`: `NOT NULL created_at`
- `users_email_check`: `CHECK ((((email)::text = lower(btrim((email)::text))) AND ((email)::text ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'::text)))`
- `users_email_not_null`: `NOT NULL email`
- `users_id_not_null`: `NOT NULL id`
- `users_lastname_check`: `CHECK ((((lastname)::text = btrim((lastname)::text)) AND ((char_length((lastname)::text) >= 1) AND (char_length((lastname)::text) <= 100)) AND ((lastname)::text !~ '[[:cntrl:][:digit:]]'::text)))`
- `users_lastname_not_null`: `NOT NULL lastname`
- `users_name_check`: `CHECK ((((name)::text = btrim((name)::text)) AND ((char_length((name)::text) >= 1) AND (char_length((name)::text) <= 100)) AND ((name)::text !~ '[[:cntrl:][:digit:]]'::text)))`
- `users_name_not_null`: `NOT NULL name`
- `users_pkey`: `PRIMARY KEY (id)`
- `users_role_code_fkey`: `FOREIGN KEY (role_code) REFERENCES roles(code)`
- `users_role_code_not_null`: `NOT NULL role_code`
- `users_timezone_not_null`: `NOT NULL timezone`
- `users_updated_at_not_null`: `NOT NULL updated_at`

Indexes (including PK/unique enforcement):

- `users_email_ci_key`: `CREATE UNIQUE INDEX users_email_ci_key ON public.users USING btree (lower((email)::text))`
- `users_pkey`: `CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)`

