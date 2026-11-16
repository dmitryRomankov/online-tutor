-- PostgreSQL 18. Run with the separate migrator, never the application login.
SET ROLE tutor_owner;
CREATE SCHEMA private AUTHORIZATION tutor_owner;
CREATE SCHEMA reporting AUTHORIZATION tutor_owner;
REVOKE ALL ON SCHEMA private, reporting FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE tutor_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE public.roles (code text PRIMARY KEY, label text NOT NULL UNIQUE);
CREATE TABLE public.task_types (
  code text PRIMARY KEY, label text NOT NULL UNIQUE,
  checking_mode text NOT NULL CHECK (checking_mode IN ('automatic', 'manual'))
);
CREATE TABLE public.input_kinds (code text PRIMARY KEY, label text NOT NULL UNIQUE);
CREATE TABLE public.lesson_item_kinds (code text PRIMARY KEY, label text NOT NULL UNIQUE);
CREATE TABLE public.session_states (code text PRIMARY KEY, label text NOT NULL UNIQUE);
INSERT INTO public.roles VALUES ('TUTOR','Tutor'),('STUDENT','Student');
INSERT INTO public.task_types VALUES
 ('single_choice','Single choice','automatic'),('fill_blanks','Fill in the blanks','automatic'),
 ('written_response','Written response','manual'),('multiple_selection','Multiple selection','automatic'),
 ('true_false','True / false','automatic'),('matching','Matching','automatic'),
 ('word_ordering','Word ordering','automatic'),('categorization','Categorization','automatic'),
 ('error_correction','Error correction','automatic'),('image_labeling','Image labeling','automatic');
INSERT INTO public.input_kinds VALUES ('text','Text'),('single_choice','Single choice'),
 ('multi_choice','Multiple choices'),('ordered_choices','Ordered choices');
INSERT INTO public.lesson_item_kinds VALUES ('text','Text'),('image','Image'),('link','Link'),('task','Task');
INSERT INTO public.session_states VALUES ('scheduled','Scheduled'),('active','Active'),('ended','Ended'),('cancelled','Cancelled');

CREATE TABLE public.users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), role_code text NOT NULL REFERENCES public.roles(code),
 username varchar(64) NOT NULL CHECK (username = btrim(username) AND char_length(username) BETWEEN 1 AND 64),
 display_name varchar(160), timezone text NOT NULL DEFAULT 'UTC',
 auth_epoch integer NOT NULL DEFAULT 0 CHECK (auth_epoch >= 0), retired_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_ci_key ON public.users(lower(username));
CREATE TABLE private.user_credentials (
 user_id uuid PRIMARY KEY REFERENCES public.users(id),
 password_hash text NOT NULL CHECK (password_hash LIKE '$argon2id$%')
);
CREATE TABLE public.tutor_students (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tutor_id uuid NOT NULL REFERENCES public.users(id),
 student_id uuid NOT NULL REFERENCES public.users(id), linked_at timestamptz NOT NULL DEFAULT now(),
 ended_at timestamptz, CHECK (tutor_id <> student_id), CHECK (ended_at IS NULL OR ended_at >= linked_at)
);
CREATE UNIQUE INDEX tutor_students_one_active_tutor ON public.tutor_students(student_id) WHERE ended_at IS NULL;
CREATE INDEX tutor_students_tutor_idx ON public.tutor_students(tutor_id, ended_at);
CREATE INDEX tutor_students_student_idx ON public.tutor_students(student_id);
CREATE TABLE public.tutor_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tutor_id uuid NOT NULL REFERENCES public.users(id),
 token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 revoked_at timestamptz, accepted_student_id uuid REFERENCES public.users(id), accepted_at timestamptz,
 CHECK (expires_at > created_at), CHECK ((accepted_at IS NULL) = (accepted_student_id IS NULL)),
 CHECK (accepted_at IS NULL OR (accepted_at >= created_at AND accepted_at < expires_at))
);
CREATE INDEX tutor_invitations_tutor_idx ON public.tutor_invitations(tutor_id);
CREATE INDEX tutor_invitations_student_idx ON public.tutor_invitations(accepted_student_id);
CREATE TABLE public.assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES public.users(id),
 object_key text NOT NULL UNIQUE CHECK (btrim(object_key) <> ''),
 media_type text NOT NULL CHECK (media_type IN ('image/png','image/jpeg','image/webp')),
 byte_size bigint NOT NULL CHECK (byte_size > 0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assets_owner_idx ON public.assets(owner_id);
CREATE TABLE public.tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES public.users(id),
 archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_owner_library_idx ON public.tasks(owner_id, archived_at, created_at DESC);
CREATE TABLE public.task_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid NOT NULL REFERENCES public.tasks(id),
 version_no integer NOT NULL CHECK (version_no > 0), type_code text NOT NULL REFERENCES public.task_types(code),
 title varchar(200) NOT NULL CHECK (btrim(title) <> ''), prompt text NOT NULL CHECK (btrim(prompt) <> ''),
 image_asset_id uuid REFERENCES public.assets(id), published_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(task_id, version_no),
 CHECK ((type_code = 'image_labeling') = (image_asset_id IS NOT NULL))
);
CREATE INDEX task_versions_image_idx ON public.task_versions(image_asset_id);
CREATE INDEX task_versions_type_idx ON public.task_versions(type_code);
CREATE TABLE public.task_inputs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_version_id uuid NOT NULL REFERENCES public.task_versions(id),
 position integer NOT NULL CHECK (position > 0), kind_code text NOT NULL REFERENCES public.input_kinds(code),
 label text NOT NULL CHECK (btrim(label) <> ''), required boolean NOT NULL DEFAULT true,
 marker_x numeric(6,3), marker_y numeric(6,3), UNIQUE(task_version_id, position),
 CHECK ((marker_x IS NULL) = (marker_y IS NULL)), CHECK (marker_x BETWEEN 0 AND 100 AND marker_y BETWEEN 0 AND 100)
);
CREATE TABLE public.task_choices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_version_id uuid NOT NULL REFERENCES public.task_versions(id),
 position integer NOT NULL CHECK (position > 0), label text NOT NULL CHECK (btrim(label) <> ''),
 UNIQUE(task_version_id, position)
);
CREATE TABLE public.task_input_choices (
 input_id uuid NOT NULL REFERENCES public.task_inputs(id), choice_id uuid NOT NULL REFERENCES public.task_choices(id),
 PRIMARY KEY(input_id, choice_id)
);
CREATE INDEX task_input_choices_choice_idx ON public.task_input_choices(choice_id);
CREATE TABLE private.task_text_keys (
 input_id uuid NOT NULL REFERENCES public.task_inputs(id), variant_no integer NOT NULL CHECK (variant_no > 0),
 accepted_text text NOT NULL CHECK (btrim(accepted_text) <> ''), PRIMARY KEY(input_id, variant_no)
);
CREATE UNIQUE INDEX task_text_keys_distinct_variant ON private.task_text_keys(input_id, lower(btrim(accepted_text)));
CREATE TABLE private.task_choice_keys (
 input_id uuid NOT NULL, choice_id uuid NOT NULL, expected_position integer CHECK (expected_position > 0),
 PRIMARY KEY(input_id, choice_id), FOREIGN KEY(input_id, choice_id) REFERENCES public.task_input_choices(input_id, choice_id)
);
CREATE UNIQUE INDEX task_choice_keys_order_key ON private.task_choice_keys(input_id, expected_position) WHERE expected_position IS NOT NULL;
CREATE INDEX task_choice_keys_choice_idx ON private.task_choice_keys(choice_id);
CREATE TABLE public.lessons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES public.users(id),
 archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lessons_owner_library_idx ON public.lessons(owner_id, archived_at, created_at DESC);
CREATE TABLE public.lesson_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lesson_id uuid NOT NULL REFERENCES public.lessons(id),
 version_no integer NOT NULL CHECK (version_no > 0), title varchar(200) NOT NULL CHECK (btrim(title) <> ''),
 published_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(lesson_id, version_no)
);
CREATE TABLE public.lesson_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lesson_version_id uuid NOT NULL REFERENCES public.lesson_versions(id),
 position integer NOT NULL CHECK (position > 0), kind_code text NOT NULL REFERENCES public.lesson_item_kinds(code),
 text_content text, asset_id uuid REFERENCES public.assets(id), link_url text,
 task_version_id uuid REFERENCES public.task_versions(id), UNIQUE(lesson_version_id, position),
 CHECK (num_nonnulls(text_content, asset_id, link_url, task_version_id) = 1),
 CHECK ((kind_code = 'text' AND text_content IS NOT NULL AND btrim(text_content) <> '') OR
        (kind_code = 'image' AND asset_id IS NOT NULL) OR
        (kind_code = 'link' AND link_url IS NOT NULL AND link_url ~ '^https://[^[:space:]]+$') OR
        (kind_code = 'task' AND task_version_id IS NOT NULL))
);
CREATE INDEX lesson_items_task_idx ON public.lesson_items(task_version_id);
CREATE INDEX lesson_items_asset_idx ON public.lesson_items(asset_id);
CREATE TABLE public.sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tutor_student_id uuid NOT NULL REFERENCES public.tutor_students(id),
 planned_lesson_id uuid NOT NULL REFERENCES public.lessons(id), scheduled_start timestamptz NOT NULL,
 duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
 state_code text NOT NULL DEFAULT 'scheduled' REFERENCES public.session_states(code),
 started_at timestamptz, ended_at timestamptz, cancelled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((state_code='scheduled' AND num_nonnulls(started_at,ended_at,cancelled_at)=0) OR
        (state_code='active' AND started_at IS NOT NULL AND ended_at IS NULL AND cancelled_at IS NULL) OR
        (state_code='ended' AND started_at IS NOT NULL AND ended_at IS NOT NULL AND ended_at >= started_at AND cancelled_at IS NULL) OR
        (state_code='cancelled' AND cancelled_at IS NOT NULL AND started_at IS NULL AND ended_at IS NULL))
);
CREATE INDEX sessions_schedule_idx ON public.sessions(tutor_student_id, scheduled_start DESC);
CREATE INDEX sessions_history_idx ON public.sessions(tutor_student_id, ended_at DESC) WHERE state_code IN ('ended','cancelled');
CREATE INDEX sessions_lesson_idx ON public.sessions(planned_lesson_id);
CREATE TABLE public.session_content (
 session_id uuid PRIMARY KEY REFERENCES public.sessions(id), lesson_version_id uuid NOT NULL REFERENCES public.lesson_versions(id),
 pinned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX session_content_version_idx ON public.session_content(lesson_version_id);
CREATE TABLE public.session_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.session_content(session_id),
 lesson_item_id uuid NOT NULL REFERENCES public.lesson_items(id), revealed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(session_id, lesson_item_id)
);
CREATE INDEX session_items_lesson_item_idx ON public.session_items(lesson_item_id);
CREATE TABLE public.session_active_items (
 session_id uuid PRIMARY KEY REFERENCES public.sessions(id), session_item_id uuid NOT NULL UNIQUE REFERENCES public.session_items(id)
);
CREATE TABLE public.chat_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.sessions(id),
 sender_id uuid NOT NULL REFERENCES public.users(id), client_message_id uuid NOT NULL,
 body text NOT NULL CHECK (btrim(body) <> '' AND char_length(body) <= 10000), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(session_id, sender_id, client_message_id)
);
CREATE INDEX chat_messages_order_idx ON public.chat_messages(session_id, created_at, id);
CREATE INDEX chat_messages_sender_idx ON public.chat_messages(sender_id);
CREATE TABLE public.feedback_releases (
 session_item_id uuid PRIMARY KEY REFERENCES public.session_items(id), released_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.homework_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tutor_student_id uuid NOT NULL REFERENCES public.tutor_students(id),
 title varchar(200) NOT NULL CHECK (btrim(title) <> ''), due_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX homework_assignments_list_idx ON public.homework_assignments(tutor_student_id, created_at DESC);
CREATE INDEX homework_assignments_due_idx ON public.homework_assignments(due_at) WHERE due_at IS NOT NULL;
CREATE TABLE public.homework_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assignment_id uuid NOT NULL REFERENCES public.homework_assignments(id),
 task_version_id uuid NOT NULL REFERENCES public.task_versions(id), position integer NOT NULL CHECK (position > 0),
 UNIQUE(assignment_id, position)
);
CREATE INDEX homework_items_version_idx ON public.homework_items(task_version_id);
CREATE TABLE public.homework_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assignment_id uuid NOT NULL REFERENCES public.homework_assignments(id),
 revision_no integer NOT NULL CHECK (revision_no > 0), created_at timestamptz NOT NULL DEFAULT now(),
 submitted_at timestamptz, returned_at timestamptz, return_note text,
 UNIQUE(assignment_id, revision_no), CHECK (submitted_at IS NULL OR submitted_at >= created_at),
 CHECK ((returned_at IS NULL AND return_note IS NULL) OR
        (submitted_at IS NOT NULL AND returned_at IS NOT NULL AND return_note IS NOT NULL AND returned_at >= submitted_at AND btrim(return_note) <> ''))
);
CREATE UNIQUE INDEX homework_revisions_one_draft ON public.homework_revisions(assignment_id) WHERE submitted_at IS NULL;
CREATE INDEX homework_revisions_submission_idx ON public.homework_revisions(submitted_at) WHERE submitted_at IS NOT NULL;
CREATE TABLE public.responses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), input_id uuid NOT NULL REFERENCES public.task_inputs(id),
 session_item_id uuid REFERENCES public.session_items(id), homework_revision_id uuid REFERENCES public.homework_revisions(id),
 homework_item_id uuid REFERENCES public.homework_items(id),
 CHECK ((session_item_id IS NOT NULL AND homework_revision_id IS NULL AND homework_item_id IS NULL) OR
        (session_item_id IS NULL AND homework_revision_id IS NOT NULL AND homework_item_id IS NOT NULL))
);
CREATE UNIQUE INDEX responses_live_input_key ON public.responses(session_item_id, input_id) WHERE session_item_id IS NOT NULL;
CREATE UNIQUE INDEX responses_homework_input_key ON public.responses(homework_revision_id, homework_item_id, input_id) WHERE homework_revision_id IS NOT NULL;
CREATE INDEX responses_input_idx ON public.responses(input_id);
CREATE INDEX responses_homework_item_idx ON public.responses(homework_item_id);
CREATE TABLE public.response_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), response_id uuid NOT NULL REFERENCES public.responses(id),
 revision_no integer NOT NULL CHECK (revision_no > 0), client_event_id uuid NOT NULL,
 text_value text, write_transaction bigint NOT NULL DEFAULT (pg_current_xact_id()::text::bigint), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(response_id, revision_no), UNIQUE(response_id, client_event_id)
);
CREATE TABLE public.response_choice_values (
 response_revision_id uuid NOT NULL REFERENCES public.response_revisions(id), choice_id uuid NOT NULL REFERENCES public.task_choices(id),
 position integer NOT NULL CHECK (position > 0), PRIMARY KEY(response_revision_id, position),
 UNIQUE(response_revision_id, choice_id)
);
CREATE INDEX response_choice_values_choice_idx ON public.response_choice_values(choice_id);
CREATE TABLE public.live_feedback_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), response_revision_id uuid NOT NULL REFERENCES public.response_revisions(id),
 comment text NOT NULL CHECK (btrim(comment) <> ''), created_at timestamptz NOT NULL DEFAULT now(), released_at timestamptz
);
CREATE INDEX live_feedback_revision_idx ON public.live_feedback_comments(response_revision_id, created_at DESC);
CREATE TABLE public.homework_feedback_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), response_revision_id uuid NOT NULL REFERENCES public.response_revisions(id),
 comment text NOT NULL CHECK (btrim(comment) <> ''), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX homework_feedback_revision_idx ON public.homework_feedback_comments(response_revision_id, created_at DESC);
CREATE TABLE public.lesson_notifications (
 session_id uuid PRIMARY KEY REFERENCES public.sessions(id), read_at timestamptz
);

COMMENT ON SCHEMA private IS 'Backend-only credential hashes and immutable answer keys; never a student DTO or reporting grant.';
COMMENT ON SCHEMA reporting IS 'Masked/aggregate reporting surfaces only; no free-text content or credentials.';
COMMENT ON TABLE public.responses IS 'One logical input response in exactly one live or homework context; values are append-only revisions.';
COMMENT ON TABLE public.response_revisions IS 'Durable acknowledged answer events; no edits after commit or after context closes.';
COMMENT ON TABLE public.session_content IS 'Immutable lesson version pinned by start_session; separate from the planned reusable lesson.';
COMMENT ON TABLE public.lesson_notifications IS 'Student recipient and creation time derive from session/link; monotonic read marker.';
RESET ROLE;
