import { writeFile } from 'node:fs/promises';
import { connect, root } from './lib.mjs';
const c = await connect(process.env.MIGRATION_DATABASE_URL);
const purposes = {
  auth_sessions: 'Private server-side login sessions referenced by HttpOnly cookies; unrelated to lesson sessions.',
  auth_rate_limits: 'Shared fixed-window authentication limits using HMAC-hashed IP keys; expires after one minute.',

  roles: 'Fixed application profile types; these are separate from PostgreSQL login roles.',
  task_types: 'Ten supported task formats and their automatic/manual checking mode.',
  input_kinds: 'Renderer and answer representation for an individual input.',
  lesson_item_kinds: 'Allowed lesson block payload types.',
  session_states: 'Allowed lesson session lifecycle states.',
  users: 'Stable account identity, fixed profile role and retirement/authentication state.',
  user_credentials: 'Backend-only Argon2id hashes; removed when the account is retired.',
  tutor_students:
    'Historical one-to-one tutor/student links; at most one active tutor per student.',
  tutor_invitations: 'Hashed invitation tokens, expiry and acceptance/revocation outcome.',
  assets: 'Owned image metadata; binaries remain in object storage.',
  tasks: 'Stable reusable task identity owned by a tutor.',
  task_versions: 'Draft or immutable published task definition.',
  task_inputs: 'Individual blank, question, matching item, ordering slot or image marker.',
  task_choices: 'Distinct choice/token identities in a task version.',
  task_input_choices: 'Allowed input/choice pairs within one task version.',
  task_text_keys: 'Private accepted text alternatives, compared after trimming and lowercasing.',
  task_choice_keys: 'Private expected choice sets or token order.',
  lessons: 'Stable reusable lesson identity.',
  lesson_versions: 'Draft or immutable published ordered lesson definition.',
  lesson_items: 'Ordered lesson blocks with exactly one payload.',
  sessions: 'Scheduled, active, ended or cancelled one-to-one lesson occurrence.',
  session_content: 'Published lesson version pinned exactly once at session start.',
  session_items: 'Items revealed by the tutor in a particular session.',
  session_active_items: 'At most one currently active revealed item per session.',
  chat_messages: 'Immutable participant messages saved during an active lesson.',
  feedback_releases: 'Tutor release marker for derived automatic task feedback.',
  homework_assignments: 'Homework assigned to a tutor/student relationship.',
  homework_items: 'Ordered published task versions assigned as homework.',
  homework_revisions: 'Independent answer attempts, with submission and return transitions.',
  responses: 'One response stream for an input in exactly one live or homework context.',
  response_revisions: 'Append-only confirmed answer edits, ordered within a response stream.',
  response_choice_values:
    'Relational selected choices or ordered tokens in one immutable answer revision.',
  live_feedback_comments:
    'Tutor comments tied to the exact live answer reviewed; release controlled by tutor.',
  homework_feedback_comments: 'Immutable tutor comments on submitted homework answers.',
  lesson_notifications:
    'Creation-only lesson notification; unread status disappears after reading.',
};
const meanings = {
  sid: 'Cryptographically random login session ID, referenced by a signed HttpOnly cookie.',
  sess: 'Server-side session JSON: cookie metadata and user ID/auth epoch/absolute expiry; no password or answer keys.',
  expire: 'Indexed absolute login session expiry; expired sessions are rejected before cleanup.',
  key_hash: 'HMAC-SHA256 of client IP using shared session secret; no raw IP address.',
  attempts: 'Authentication attempts in current fixed window; capped at 21, with attempts 1–20 allowed.',
  id: 'Stable UUID identifier.',
  code: 'Stable lookup code used by foreign keys.',
  label: 'Human-readable label.',
  role_code: 'Fixed tutor/student profile type.',
  email: 'Trimmed lowercase login email; unique without case distinctions.',
  name: 'Required given name, 1–100 characters; anonymized on retirement.',
  lastname: 'Required family name, 1–100 characters; anonymized on retirement.',
  timezone: 'Valid PostgreSQL/IANA timezone name.',
  auth_epoch: 'Authentication generation; incremented on retirement.',
  retired_at: 'Retirement time; NULL means the account is active.',
  password_hash: 'Argon2id encoded password hash; never plaintext.',
  linked_at: 'Time the tutor/student relationship started.',
  ended_at: 'Actual session end or relationship closure time.',
  token_hash: 'SHA-256 hex digest of invitation token; never the raw token.',
  expires_at: 'Invitation or authentication rate-window expiry time, depending on the table.',
  revoked_at: 'Invitation revocation time.',
  accepted_at: 'Invitation acceptance time.',
  object_key: 'Private storage object identifier; not a public/signed URL.',
  media_type: 'Allowed image MIME type.',
  byte_size: 'Positive file size in bytes.',
  created_at: 'Record creation time.',
  updated_at: 'Last account update time, maintained by trigger.',
  archived_at: 'Archive marker for reusable content.',
  version_no: 'Positive content version number within its parent.',
  revision_no: 'Positive consecutive answer/homework revision number.',
  type_code: 'Task format lookup reference.',
  title: 'Non-empty human-readable title.',
  prompt: 'Task instructions shown to the learner.',
  published_at: 'Publication time; NULL identifies an editable draft.',
  position: 'Positive order within the parent collection.',
  kind_code: 'Allowed payload or input representation.',
  required: 'Whether an answer is required for progress/submission.',
  marker_x: 'Horizontal image marker coordinate, percentage 0–100.',
  marker_y: 'Vertical image marker coordinate, percentage 0–100.',
  variant_no: 'Positive accepted-text alternative number for this input.',
  accepted_text: 'One accepted text answer; private to the backend/tutor.',
  expected_position: 'Expected token order; NULL for unordered choice sets.',
  text_content: 'Lesson text block payload.',
  link_url: 'HTTPS external learning-resource URL.',
  scheduled_start: 'Scheduled session start instant.',
  duration_minutes: 'Positive planned duration; scheduled end is derived.',
  state_code: 'Session lifecycle state.',
  started_at: 'Actual session start time.',
  cancelled_at: 'Session cancellation time.',
  pinned_at: 'Time the published lesson version was fixed for this session.',
  revealed_at: 'Time tutor exposed the item.',
  client_message_id: 'Client retry identifier, unique within session and sender.',
  body: 'Non-empty chat text, maximum 10,000 characters.',
  released_at: 'Tutor release time; NULL means feedback is not released.',
  due_at: 'Optional homework deadline.',
  submitted_at: 'Homework submission time; answers become immutable.',
  returned_at: 'Time tutor requested a new homework attempt.',
  return_note: 'Non-empty explanation accompanying a returned submission.',
  client_event_id: 'Client retry identifier, unique within one response stream.',
  text_value: 'Saved text answer; NULL for choice-based answers.',
  write_transaction: 'Internal transaction ID enforcing atomic insertion of selected choices.',
  comment: 'Non-empty tutor feedback text.',
  read_at: 'First-read time; NULL means unread.',
  checking_mode: 'Automatic comparison or manual tutor review.',
};
const esc = (v) =>
  String(v ?? '—')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
try {
  const tables = (
    await c.query(
      "SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','private') AND tablename<>'_prisma_migrations' ORDER BY schemaname,tablename"
    )
  ).rows;
  const constraints = (
    await c.query(
      "SELECT n.nspname AS schema,c.relname AS table_name,k.conname,k.contype,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relname<>'_prisma_migrations' ORDER BY 1,2,3"
    )
  ).rows;
  let doc =
    '# Data dictionary\n\nGenerated from PostgreSQL 18 by `npm run db:docs`. SQL migrations remain authoritative. UUID keys are stable; timestamps are `timestamptz`; all foreign keys use NO ACTION on update/delete to protect history. Nullable columns are explicitly marked.\n\n';
  let diagram =
    '# Logical database schema\n\nAll 37 relations and every foreign key are shown below. `o|` marks an optional parent; each parent can have zero or many dependent rows unless the key/unique constraints listed in the dictionary limit this to one. Composite foreign keys are labelled with all participating columns.\n\n```mermaid\nerDiagram\n';
  for (const t of tables) {
    const key = `${t.schemaname}.${t.tablename}`;
    doc += `## ${key}\n\n${purposes[t.tablename]}\n\n| Column | PostgreSQL type | Nullable | Default | Meaning |\n| --- | --- | --- | --- | --- |\n`;
    const columns = (
      await c.query(
        'SELECT column_name,data_type,udt_name,character_maximum_length,numeric_precision,numeric_scale,is_nullable,column_default FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position',
        [t.schemaname, t.tablename]
      )
    ).rows;
    diagram += `  ${t.schemaname}_${t.tablename} {\n`;
    for (const col of columns) {
      const meaning =
        meanings[col.column_name] ??
        (col.column_name.endsWith('_id')
          ? 'Reference to ' + col.column_name.slice(0, -3).replaceAll('_', ' ') + '.'
          : null);
      if (!meaning) throw new Error(`Missing column explanation: ${key}.${col.column_name}`);
      const type =
        col.data_type + (col.character_maximum_length ? `(${col.character_maximum_length})` : '');
      doc += `| ${col.column_name} | ${type} | ${col.is_nullable} | ${esc(col.column_default)} | ${meaning} |\n`;
      diagram += `    ${col.udt_name} ${col.column_name}\n`;
    }
    diagram += '  }\n';
    doc += '\nConstraints:\n\n';
    for (const k of constraints.filter(
      (k) => k.schema === t.schemaname && k.table_name === t.tablename
    ))
      doc += `- \`${k.conname}\`: \`${k.definition}\`\n`;
    const indexes = (
      await c.query(
        'SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=$1 AND tablename=$2 ORDER BY indexname',
        [t.schemaname, t.tablename]
      )
    ).rows;
    doc += '\nIndexes (including PK/unique enforcement):\n\n';
    for (const i of indexes) doc += `- \`${i.indexname}\`: \`${i.indexdef}\`\n`;
    doc += '\n';
  }
  const fks = (
    await c.query(
      "SELECT n.nspname AS child_schema,c.relname AS child,pn.nspname AS parent_schema,p.relname AS parent,k.conname, bool_and(a.attnotnull) AS required,string_agg(a.attname, ', ' ORDER BY s.i) AS columns FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class p ON p.oid=k.confrelid JOIN pg_namespace pn ON pn.oid=p.relnamespace CROSS JOIN LATERAL generate_subscripts(k.conkey,1) s(i) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.conkey[s.i] WHERE k.contype='f' AND n.nspname IN ('public','private') GROUP BY n.nspname,c.relname,pn.nspname,p.relname,k.conname ORDER BY 1,2,5"
    )
  ).rows;
  for (const fk of fks)
    diagram += `  ${fk.parent_schema}_${fk.parent} ${fk.required ? '||' : '|o'}--o{ ${fk.child_schema}_${fk.child} : "${fk.columns}"\n`;
  diagram +=
    '```\n\nConditional uniqueness, context XOR rules and lifecycle constraints are detailed in [the data dictionary](data-dictionary.md) and [advanced features](advanced-features.md).\n';
  await writeFile(joinPath('data-dictionary.md'), doc);
  await writeFile(joinPath('logical-schema.md'), diagram);
  console.log(
    `Generated dictionary for ${tables.length} tables and diagram for ${fks.length} foreign keys.`
  );
} finally {
  await c.end();
}
function joinPath(name) {
  return root + 'docs/database/' + name;
}
