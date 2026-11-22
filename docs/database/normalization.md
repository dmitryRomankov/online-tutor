# Normalization through third normal form

The model separates reusable definitions, their immutable versions, scheduled occurrences and individual attempts. The generated [dictionary](data-dictionary.md) lists the actual keys and constraints; the [diagram](logical-schema.md) shows their relationships.

## First normal form

Each column holds one value. Choice options, accepted text variants, allowed input/choice pairs, selected values, lesson blocks and homework tasks have separate rows. No comma-separated IDs, repeating `answer1/answer2` fields, arrays of relational IDs or JSON task payloads are used. A free-text answer is a scalar document value; its words are not separate relational entities.

## Second normal form

Every non-key attribute depends on the whole candidate key. In `task_text_keys`, `(input_id, variant_no)` identifies one accepted string. In `task_choice_keys`, `(input_id, choice_id)` determines the expected ordering position. In `response_choice_values`, `(response_revision_id, position)` determines the selected token; `(response_revision_id, choice_id)` is an alternative unique key. Junction rows do not repeat parent titles, ownership or type labels.

## Third normal form

Within each relation, non-key attributes describe its key rather than another non-key attribute. Principal functional dependencies are:

| Relation family | Functional dependency | Avoided duplication |
| --- | --- | --- |
| Lookup tables | `code → label` (and task checking mode) | Role/type/state labels are not copied into accounts, tasks or sessions. |
| Accounts and links | `user_id → profile attributes`; `link_id → tutor_id, student_id, linked_at, ended_at` | Sessions and homework reference the link instead of repeating participant IDs. |
| Tasks | `task_id → owner, archive, creation`; `(task_id, version_no) → version_id, definition` | Every response does not contain a copy of the task prompt, owner or answer key. |
| Inputs/choices | `input_id → version, position, input configuration`; `choice_id → version, position, label` | One allowed-choice junction connects existing identities; category labels can be shared by several inputs. |
| Lessons | `(lesson_id, version_no) → version_id, title, publication`; `(version_id, position) → block` | Lesson blocks reference exact published task versions. |
| Sessions | `session_id → link, planned lesson, schedule, lifecycle`; `session_id → pinned version` in the optional content relation | The planned reusable lesson and actual pinned version are distinct facts, not copied history. |
| Homework | `assignment_id → link, title, deadline`; `(assignment_id, revision_no) → attempt` | Each attempt has its own responses; earlier submissions are preserved. |
| Answers | `response_id → input and exclusive context`; `(response_id, revision_no) → event, value, save time` | Learner, tutor and assigned task are derived through the context instead of stored redundantly on answers. |
| Notifications | `session_id → read_at` | Recipient and creation time derive from the session and its link. |

Foreign keys connect relations; conditional uniqueness constrains active subsets. The mutually exclusive context on `responses` is enforced by a CHECK: either a live item, or a homework attempt plus assigned item. The latter pair describes the intersection of two independent dimensions, rather than duplicating an assignment column. Image coordinates are an optional input configuration. Input kinds describe the answer representation; task type describes teaching behavior. Publication rules constrain compatible combinations.

Progress, correctness, scheduled end, homework state, unread lists, and report counts are views, not stored aggregates. No duplicate attendance or lesson-history table is created. Attendance/response-time analytics that need connection events are not implemented by this schema; they require explicit future event collection rather than inferring attendance from a scheduled lesson.

Immutable published versions and submitted attempts are deliberate historical facts. They preserve which content and answer existed at that point; they are not mutable duplicates of a current record. Generated identifiers and internal `write_transaction` metadata support persistence without introducing user-visible duplicated business facts.

## Authentication infrastructure

The 35 teaching/account domain tables retain the normalization rules above. Two private infrastructure tables support authentication. In `auth_rate_limits`, `key_hash` determines `attempts` and `expires_at`. In `auth_sessions`, `sid` identifies an opaque `express-session` payload and its indexed expiry. JSON here is the middleware serialization boundary, not a task definition or substitute for normalized domain data. It contains cookie metadata and a user ID/authentication generation/absolute expiry, never copied names, emails, passwords or lesson content.
