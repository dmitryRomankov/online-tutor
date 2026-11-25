# Logical database schema

All 37 relations and every foreign key are shown below. `o|` marks an optional parent; each parent can have zero or many dependent rows unless the key/unique constraints listed in the dictionary limit this to one. Composite foreign keys are labelled with all participating columns.

```mermaid
erDiagram
  private_auth_rate_limits {
    varchar key_hash
    int4 attempts
    timestamptz expires_at
  }
  private_auth_sessions {
    varchar sid
    json sess
    timestamptz expire
  }
  private_task_choice_keys {
    uuid input_id
    uuid choice_id
    int4 expected_position
  }
  private_task_text_keys {
    uuid input_id
    int4 variant_no
    text accepted_text
  }
  private_user_credentials {
    uuid user_id
    text password_hash
  }
  public_assets {
    uuid id
    uuid owner_id
    text object_key
    text media_type
    int8 byte_size
    timestamptz created_at
  }
  public_chat_messages {
    uuid id
    uuid session_id
    uuid sender_id
    uuid client_message_id
    text body
    timestamptz created_at
  }
  public_feedback_releases {
    uuid session_item_id
    timestamptz released_at
  }
  public_homework_assignments {
    uuid id
    uuid tutor_student_id
    varchar title
    timestamptz due_at
    timestamptz created_at
  }
  public_homework_feedback_comments {
    uuid id
    uuid response_revision_id
    text comment
    timestamptz created_at
  }
  public_homework_items {
    uuid id
    uuid assignment_id
    uuid task_version_id
    int4 position
  }
  public_homework_revisions {
    uuid id
    uuid assignment_id
    int4 revision_no
    timestamptz created_at
    timestamptz submitted_at
    timestamptz returned_at
    text return_note
  }
  public_input_kinds {
    text code
    text label
  }
  public_lesson_item_kinds {
    text code
    text label
  }
  public_lesson_items {
    uuid id
    uuid lesson_version_id
    int4 position
    text kind_code
    text text_content
    uuid asset_id
    text link_url
    uuid task_version_id
  }
  public_lesson_notifications {
    uuid session_id
    timestamptz read_at
  }
  public_lesson_versions {
    uuid id
    uuid lesson_id
    int4 version_no
    varchar title
    timestamptz published_at
    timestamptz created_at
  }
  public_lessons {
    uuid id
    uuid owner_id
    timestamptz archived_at
    timestamptz created_at
  }
  public_live_feedback_comments {
    uuid id
    uuid response_revision_id
    text comment
    timestamptz created_at
    timestamptz released_at
  }
  public_response_choice_values {
    uuid response_revision_id
    uuid choice_id
    int4 position
  }
  public_response_revisions {
    uuid id
    uuid response_id
    int4 revision_no
    uuid client_event_id
    text text_value
    int8 write_transaction
    timestamptz created_at
  }
  public_responses {
    uuid id
    uuid input_id
    uuid session_item_id
    uuid homework_revision_id
    uuid homework_item_id
  }
  public_roles {
    text code
    text label
  }
  public_session_active_items {
    uuid session_id
    uuid session_item_id
  }
  public_session_content {
    uuid session_id
    uuid lesson_version_id
    timestamptz pinned_at
  }
  public_session_items {
    uuid id
    uuid session_id
    uuid lesson_item_id
    timestamptz revealed_at
  }
  public_session_states {
    text code
    text label
  }
  public_sessions {
    uuid id
    uuid tutor_student_id
    uuid planned_lesson_id
    timestamptz scheduled_start
    int4 duration_minutes
    text state_code
    timestamptz started_at
    timestamptz ended_at
    timestamptz cancelled_at
    timestamptz created_at
  }
  public_task_choices {
    uuid id
    uuid task_version_id
    int4 position
    text label
  }
  public_task_input_choices {
    uuid input_id
    uuid choice_id
  }
  public_task_inputs {
    uuid id
    uuid task_version_id
    int4 position
    text kind_code
    text label
    bool required
    numeric marker_x
    numeric marker_y
  }
  public_task_types {
    text code
    text label
    text checking_mode
  }
  public_task_versions {
    uuid id
    uuid task_id
    int4 version_no
    text type_code
    varchar title
    text prompt
    uuid image_asset_id
    timestamptz published_at
    timestamptz created_at
    text passage
  }
  public_tasks {
    uuid id
    uuid owner_id
    timestamptz archived_at
    timestamptz created_at
  }
  public_tutor_invitations {
    uuid id
    uuid tutor_id
    bpchar token_hash
    timestamptz created_at
    timestamptz expires_at
    timestamptz revoked_at
    uuid accepted_student_id
    timestamptz accepted_at
  }
  public_tutor_students {
    uuid id
    uuid tutor_id
    uuid student_id
    timestamptz linked_at
    timestamptz ended_at
  }
  public_users {
    uuid id
    text role_code
    text timezone
    int4 auth_epoch
    timestamptz retired_at
    timestamptz created_at
    timestamptz updated_at
    varchar email
    varchar name
    varchar lastname
  }
  public_task_input_choices ||--o{ private_task_choice_keys : "input_id, choice_id"
  public_task_inputs ||--o{ private_task_text_keys : "input_id"
  public_users ||--o{ private_user_credentials : "user_id"
  public_users ||--o{ public_assets : "owner_id"
  public_users ||--o{ public_chat_messages : "sender_id"
  public_sessions ||--o{ public_chat_messages : "session_id"
  public_session_items ||--o{ public_feedback_releases : "session_item_id"
  public_tutor_students ||--o{ public_homework_assignments : "tutor_student_id"
  public_response_revisions ||--o{ public_homework_feedback_comments : "response_revision_id"
  public_homework_assignments ||--o{ public_homework_items : "assignment_id"
  public_task_versions ||--o{ public_homework_items : "task_version_id"
  public_homework_assignments ||--o{ public_homework_revisions : "assignment_id"
  public_assets |o--o{ public_lesson_items : "asset_id"
  public_lesson_item_kinds ||--o{ public_lesson_items : "kind_code"
  public_lesson_versions ||--o{ public_lesson_items : "lesson_version_id"
  public_task_versions |o--o{ public_lesson_items : "task_version_id"
  public_sessions ||--o{ public_lesson_notifications : "session_id"
  public_lessons ||--o{ public_lesson_versions : "lesson_id"
  public_users ||--o{ public_lessons : "owner_id"
  public_response_revisions ||--o{ public_live_feedback_comments : "response_revision_id"
  public_task_choices ||--o{ public_response_choice_values : "choice_id"
  public_response_revisions ||--o{ public_response_choice_values : "response_revision_id"
  public_responses ||--o{ public_response_revisions : "response_id"
  public_homework_items |o--o{ public_responses : "homework_item_id"
  public_homework_revisions |o--o{ public_responses : "homework_revision_id"
  public_task_inputs ||--o{ public_responses : "input_id"
  public_session_items |o--o{ public_responses : "session_item_id"
  public_sessions ||--o{ public_session_active_items : "session_id"
  public_session_items ||--o{ public_session_active_items : "session_item_id"
  public_lesson_versions ||--o{ public_session_content : "lesson_version_id"
  public_sessions ||--o{ public_session_content : "session_id"
  public_lesson_items ||--o{ public_session_items : "lesson_item_id"
  public_session_content ||--o{ public_session_items : "session_id"
  public_lessons ||--o{ public_sessions : "planned_lesson_id"
  public_session_states ||--o{ public_sessions : "state_code"
  public_tutor_students ||--o{ public_sessions : "tutor_student_id"
  public_task_versions ||--o{ public_task_choices : "task_version_id"
  public_task_choices ||--o{ public_task_input_choices : "choice_id"
  public_task_inputs ||--o{ public_task_input_choices : "input_id"
  public_input_kinds ||--o{ public_task_inputs : "kind_code"
  public_task_versions ||--o{ public_task_inputs : "task_version_id"
  public_assets |o--o{ public_task_versions : "image_asset_id"
  public_tasks ||--o{ public_task_versions : "task_id"
  public_task_types ||--o{ public_task_versions : "type_code"
  public_users ||--o{ public_tasks : "owner_id"
  public_users |o--o{ public_tutor_invitations : "accepted_student_id"
  public_users ||--o{ public_tutor_invitations : "tutor_id"
  public_users ||--o{ public_tutor_students : "student_id"
  public_users ||--o{ public_tutor_students : "tutor_id"
  public_roles ||--o{ public_users : "role_code"
```

Conditional uniqueness, context XOR rules and lifecycle constraints are detailed in [the data dictionary](data-dictionary.md) and [advanced features](advanced-features.md).
