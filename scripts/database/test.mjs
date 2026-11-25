import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm, access, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { spawnSync } from 'node:child_process';
import { connect, root, identifier, transaction } from './lib.mjs';
import { bootstrap } from './bootstrap.mjs';
import { seedReference } from './reference-seed.mjs';
import { seedDemo } from './demo-seed.mjs';

function command(exe, args, options = {}) {
  const r = spawnSync(exe, args, { cwd: root, encoding: 'utf8', ...options });
  if (r.status !== 0)
    throw new Error(
      `${exe.split('/').at(-1)} failed: ${r.stderr || r.stdout || r.error || `exit status ${r.status}`}`
    );
  return r.stdout;
}
let directory,
  bin,
  started = false,
  admin,
  dbAdmin,
  app,
  reporter,
  migrator;
const opened = [];
let testDatabase;
const password = () => randomBytes(24).toString('hex');
let passed = 0;
const check = async (name, run) => {
  await run();
  passed++;
  console.log(`ok ${passed} - ${name}`);
};
const reject = async (sql, params = [], codes = ['23514']) =>
  assert.rejects(app.query(sql, params), (e) => codes.includes(e.code));
try {
  let adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
  if (adminUrl && process.env.TEST_DATABASE_ISOLATED !== '1')
    throw new Error(
      'External test server must be dedicated: set TEST_DATABASE_ISOLATED=1. Test provisioning rotates tutor_* passwords.'
    );
  if (!adminUrl) {
    bin = process.env.PG_BIN;
    if (!bin) {
      try {
        await access('/Applications/Postgres.app/Contents/Versions/latest/bin/initdb');
        bin = '/Applications/Postgres.app/Contents/Versions/latest/bin';
      } catch {
        throw new Error(
          'Set PG_BIN to PostgreSQL 18 binaries, or provide a dedicated TEST_ADMIN_DATABASE_URL + TEST_DATABASE_ISOLATED=1'
        );
      }
    }
    directory = await mkdtemp(join(tmpdir(), 'online-tutor-db-'));
    const adminPassword = password(),
      pwfile = join(directory, 'password');
    await writeFile(pwfile, adminPassword, { mode: 0o600 });
    command(join(bin, 'initdb'), [
      '-D',
      join(directory, 'data'),
      '-U',
      'postgres',
      '--auth-local=scram-sha-256',
      '--auth-host=scram-sha-256',
      '--pwfile',
      pwfile,
    ]);
    const server = createServer();
    await new Promise((resolve, reject) =>
      server.once('error', reject).listen(0, '127.0.0.1', resolve)
    );
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    command(join(bin, 'pg_ctl'), [
      '-D',
      join(directory, 'data'),
      '-l',
      join(directory, 'server.log'),
      '-o',
      `-p ${port} -h 127.0.0.1 -k ${directory}`,
      'start',
    ]);
    started = true;
    adminUrl = `postgresql://postgres:${adminPassword}@127.0.0.1:${port}/postgres`;
  }
  admin = await connect(adminUrl);
  assert.equal(
    (await admin.query('SHOW server_version_num')).rows[0].server_version_num.slice(0, 2),
    '18',
    'Verification targets PostgreSQL 18'
  );
  const passwords = Object.fromEntries(
    ['tutor_migrator', 'tutor_app', 'tutor_reporter'].map((r) => [r, password()])
  );
  await bootstrap(admin, passwords);
  const name = `online_tutor_${randomBytes(6).toString('hex')}_test`;
  await admin.query(`CREATE DATABASE ${identifier(name)} OWNER tutor_owner`);
  testDatabase = name;
  const urlFor = (role, pw) => {
    const u = new URL(adminUrl);
    u.pathname = '/' + name;
    u.username = role;
    u.password = pw;
    return u.toString();
  };
  dbAdmin = await connect(urlFor(new URL(adminUrl).username, new URL(adminUrl).password));
  await dbAdmin.query('ALTER SCHEMA public OWNER TO tutor_owner');
  await dbAdmin.query(`REVOKE TEMPORARY ON DATABASE ${identifier(name)} FROM PUBLIC`);
  const migrationUrl = urlFor('tutor_migrator', passwords.tutor_migrator);
  const migrate = () =>
    command(
      process.execPath,
      [
        'node_modules/prisma/build/index.js',
        'migrate',
        'deploy',
        '--config',
        'api/prisma.config.ts',
      ],
      { env: { ...process.env, MIGRATION_DATABASE_URL: migrationUrl } }
    );
  await check('fresh migrations and replay', async () => {
    migrate();
    migrate();
  });
  if (process.argv.includes('--refresh-docs'))
    command(process.execPath, ['scripts/database/docs.mjs'], {
      env: { ...process.env, MIGRATION_DATABASE_URL: migrationUrl },
    });
  migrator = await connect(migrationUrl);
  app = await connect(urlFor('tutor_app', passwords.tutor_app));
  reporter = await connect(urlFor('tutor_reporter', passwords.tutor_reporter));
  await check('session infrastructure remains backend-only', async () => {
    for (const table of ['auth_sessions', 'auth_rate_limits']) {
      await assert.rejects(
        reporter.query(`SELECT * FROM private.${table}`),
        (error) => error.code === '42501'
      );
      await reject(`ALTER TABLE private.${table} ADD COLUMN forbidden text`, [], ['42501']);
    }
  });
  await check('identity constraints and runtime profile permissions', async () => {
    const insert = "INSERT INTO users(role_code,email,name,lastname) VALUES('STUDENT',$1,$2,$3)";
    await reject(insert, ['bad', 'Alex', 'Rivera']);
    await reject(insert, ['Mixed@Example.test', 'Alex', 'Rivera']);
    await reject(insert, ['name@example.test', ' ', 'Rivera']);
    await reject(insert, ['name@example.test', 'Alex', '7']);
    await reject(insert, ['name@example.test', 'x'.repeat(101), 'Rivera'], ['22001']);
    await reject(insert, ['retired-test@retired.invalid', 'Alex', 'Rivera']);
    await assert.rejects(
      app.query("UPDATE users SET email='other@example.test'"),
      (error) => error.code === '42501'
    );
  });
  await check('reference seed is replayable', async () => {
    await seedReference(migrator);
    await seedReference(migrator);
    assert.equal((await app.query('SELECT count(*)::int AS n FROM task_types')).rows[0].n, 10);
  });
  await check('all 37 tables have primary keys', async () => {
    const {
      rows: [r],
    } = await dbAdmin.query(
      "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname IN ('public','private') AND tablename<>'_prisma_migrations'"
    );
    assert.equal(r.n, 37);
    const missing = await dbAdmin.query(
      "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relkind='r' AND NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='p')"
    );
    assert.equal(missing.rowCount, 0);
  });
  await check('application is a non-owner, non-superuser without elevated membership', async () => {
    const {
      rows: [r],
    } = await app.query(
      "SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,pg_has_role(current_user,'tutor_owner','MEMBER') AS owner_member FROM pg_roles WHERE rolname=current_user"
    );
    assert(Object.values(r).every((x) => x === false));
    assert.equal(
      (
        await dbAdmin.query(
          "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname IN ('public','private') AND tableowner='tutor_app'"
        )
      ).rows[0].n,
      0
    );
  });
  await check(
    'runtime cannot create schema/table, assume owner, or read migration metadata',
    async () => {
      for (const sql of [
        'CREATE SCHEMA forbidden',
        'CREATE TABLE public.forbidden(id int)',
        'CREATE TEMP TABLE forbidden(id int)',
        'CREATE ROLE forbidden',
        'CREATE DATABASE forbidden',
        'ALTER TABLE public.users DISABLE TRIGGER ALL',
        'SET ROLE tutor_owner',
        'SELECT * FROM public._prisma_migrations',
      ])
        await reject(sql, [], ['42501']);
    }
  );
  const fixture = await seedDemo(app, password());
  await check('demo seed covers ten published formats and is replayable', async () => {
    assert.equal((await seedDemo(app, password())).existing, true);
    assert.equal(
      (
        await app.query(
          'SELECT count(DISTINCT type_code)::int AS n FROM task_versions WHERE published_at IS NOT NULL'
        )
      ).rows[0].n,
      10
    );
    assert.equal((await app.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 2);
  });
  const {
    rows: [live],
  } = await app.query(
    'SELECT * FROM latest_responses WHERE session_item_id=$1 ORDER BY input_id LIMIT 1',
    [fixture.sessionItem]
  );
  await check('three of five confirmed answers produce 60% progress', async () => {
    const {
      rows: [p],
    } = await app.query('SELECT * FROM live_task_progress WHERE session_item_id=$1', [
      fixture.sessionItem,
    ]);
    assert.equal(p.answered_percent, '60.00');
  });
  await check('emails are unique and roles are fixed', async () => {
    await reject(
      "INSERT INTO users(role_code,email,name,lastname) VALUES('STUDENT','demo.tutor@example.test','Demo','Tutor')",
      [],
      ['23505']
    );
    await reject("UPDATE users SET role_code='STUDENT' WHERE id=$1", [fixture.tutor], ['42501']);
  });
  await check('only one active tutor link per student and correct participant roles', async () => {
    await reject(
      'INSERT INTO tutor_students(tutor_id,student_id) VALUES($1,$2)',
      [fixture.tutor, fixture.student],
      ['23505']
    );
    await reject('INSERT INTO tutor_students(tutor_id,student_id) VALUES($1,$2)', [
      fixture.student,
      fixture.tutor,
    ]);
  });
  await check('published task, choices, keys and lesson content are immutable', async () => {
    for (const sql of [
      "UPDATE task_versions SET title='Changed'",
      "UPDATE task_inputs SET label='Changed'",
      'DELETE FROM private.task_text_keys',
      "UPDATE lesson_versions SET title='Changed'",
      'DELETE FROM lesson_items',
    ])
      await reject(sql);
  });
  await check('response context must match assigned task version', async () => {
    const {
      rows: [i],
    } = await app.query(
      "SELECT i.id FROM task_inputs i JOIN task_versions v ON v.id=i.task_version_id WHERE v.type_code='written_response'"
    );
    await reject('INSERT INTO responses(input_id,session_item_id) VALUES($1,$2)', [
      i.id,
      fixture.sessionItem,
    ]);
  });
  await check('unreleased results and hidden content are absent from classroom views', async () => {
    assert.equal((await app.query('SELECT * FROM released_live_results')).rowCount, 0);
    assert.equal((await app.query('SELECT * FROM classroom_revealed_content')).rowCount, 1);
    const names = (await app.query('SELECT * FROM classroom_revealed_content LIMIT 0')).fields.map(
      (f) => f.name
    );
    assert(!names.some((n) => /password|accepted_text|expected_position/.test(n)));
  });
  await check('revision numbering, retry keys and immutable events', async () => {
    await reject(
      'INSERT INTO response_revisions(response_id,revision_no,client_event_id,text_value) VALUES($1,3,$2,$3)',
      [live.response_id, randomUUID(), 'new']
    );
    const event = randomUUID();
    await app.query(
      'INSERT INTO response_revisions(response_id,revision_no,client_event_id,text_value) VALUES($1,2,$2,$3)',
      [live.response_id, event, 'wrong']
    );
    await reject(
      'INSERT INTO response_revisions(response_id,revision_no,client_event_id,text_value) VALUES($1,3,$2,$3)',
      [live.response_id, event, 'retry'],
      ['23505']
    );
    await reject("UPDATE response_revisions SET text_value='rewrite'", [], ['42501']);
  });
  await check('released correctness derives from latest confirmed revision', async () => {
    await app.query('INSERT INTO feedback_releases(session_item_id) VALUES($1)', [
      fixture.sessionItem,
    ]);
    const {
      rows: [r],
    } = await app.query('SELECT is_correct FROM released_live_results WHERE response_id=$1', [
      live.response_id,
    ]);
    assert.equal(r.is_correct, false);
  });
  await check('creation-only notifications disappear from unread view once read', async () => {
    const before = (await app.query('SELECT * FROM unread_lesson_notifications')).rowCount;
    await app.query('UPDATE lesson_notifications SET read_at=now() WHERE session_id=$1', [
      fixture.session,
    ]);
    assert.equal(
      (await app.query('SELECT * FROM unread_lesson_notifications')).rowCount,
      before - 1
    );
    await reject('UPDATE lesson_notifications SET read_at=NULL WHERE session_id=$1', [
      fixture.session,
    ]);
  });
  await check(
    'submitted homework is immutable and feedback changes derived review state',
    async () => {
      const {
        rows: [r],
      } = await app.query('SELECT * FROM latest_responses WHERE homework_revision_id=$1', [
        fixture.homework,
      ]);
      await reject(
        'INSERT INTO response_revisions(response_id,revision_no,client_event_id,text_value) VALUES($1,2,$2,$3)',
        [r.response_id, randomUUID(), 'too late']
      );
      assert.equal(
        (
          await app.query(
            'SELECT status FROM homework_revision_status WHERE homework_revision_id=$1',
            [fixture.homework]
          )
        ).rows[0].status,
        'reviewed'
      );
    }
  );
  let draft;
  await check(
    'returned homework opens an independent new draft; incomplete submit fails at commit',
    async () => {
      await app.query(
        "UPDATE homework_revisions SET returned_at=now(),return_note='Add an example' WHERE id=$1",
        [fixture.homework]
      );
      const {
        rows: [old],
      } = await app.query('SELECT * FROM homework_revisions WHERE id=$1', [fixture.homework]);
      draft = (
        await app.query(
          'INSERT INTO homework_revisions(assignment_id,revision_no) VALUES($1,2) RETURNING *',
          [old.assignment_id]
        )
      ).rows[0];
      await reject('UPDATE homework_revisions SET submitted_at=now() WHERE id=$1', [draft.id]);
      assert.equal(
        (await app.query('SELECT submitted_at FROM homework_revisions WHERE id=$1', [draft.id]))
          .rows[0].submitted_at,
        null
      );
    }
  );
  await check(
    'reporter sees only masked aggregates and cannot read raw/private content or execute retirement',
    async () => {
      const { rows } = await reporter.query('SELECT * FROM reporting.account_activity');
      assert.equal(rows.length, 2);
      assert(rows.every((r) => r.masked_account.startsWith('account-')));
      assert(!JSON.stringify(rows).includes('demo.'));
      for (const sql of [
        'SELECT * FROM public.users',
        'SELECT * FROM private.user_credentials',
        'SELECT * FROM public.chat_messages',
        `SELECT public.retire_account('${fixture.student}')`,
      ])
        await assert.rejects(reporter.query(sql), (e) => e.code === '42501');
    }
  );
  await check(
    'choice writes are atomic, allowed for the input and validated at commit',
    async () => {
      const {
        rows: [item],
      } = await app.query(
        "SELECT li.id FROM lesson_items li JOIN task_versions tv ON tv.id=li.task_version_id WHERE tv.type_code='single_choice'"
      );
      const si = (
        await app.query(
          'INSERT INTO session_items(session_id,lesson_item_id) VALUES($1,$2) RETURNING id',
          [fixture.session, item.id]
        )
      ).rows[0];
      const {
        rows: [input],
      } = await app.query(
        "SELECT i.id FROM task_inputs i JOIN task_versions v ON v.id=i.task_version_id WHERE v.type_code='single_choice'"
      );
      const response = (
        await app.query(
          'INSERT INTO responses(input_id,session_item_id) VALUES($1,$2) RETURNING id',
          [input.id, si.id]
        )
      ).rows[0];
      const choices = (
        await app.query(
          'SELECT choice_id FROM task_input_choices WHERE input_id=$1 ORDER BY choice_id',
          [input.id]
        )
      ).rows;
      let rev;
      await transaction(app, async () => {
        rev = (
          await app.query(
            'INSERT INTO response_revisions(response_id,revision_no,client_event_id) VALUES($1,1,$2) RETURNING id',
            [response.id, randomUUID()]
          )
        ).rows[0];
        await app.query('INSERT INTO response_choice_values VALUES($1,$2,1)', [
          rev.id,
          choices[0].choice_id,
        ]);
      });
      await reject('INSERT INTO response_choice_values VALUES($1,$2,2)', [
        rev.id,
        choices[1].choice_id,
      ]);
      await assert.rejects(
        transaction(app, async () => {
          const rr = (
            await app.query(
              'INSERT INTO response_revisions(response_id,revision_no,client_event_id) VALUES($1,2,$2) RETURNING id',
              [response.id, randomUUID()]
            )
          ).rows[0];
          for (const [i, c] of choices.entries())
            await app.query('INSERT INTO response_choice_values VALUES($1,$2,$3)', [
              rr.id,
              c.choice_id,
              i + 1,
            ]);
        }),
        (e) => e.code === '23514'
      );
      const other = (
        await app.query('SELECT id FROM task_choices WHERE id<>ALL($1::uuid[]) LIMIT 1', [
          choices.map((c) => c.choice_id),
        ])
      ).rows[0];
      await assert.rejects(
        transaction(app, async () => {
          const rr = (
            await app.query(
              'INSERT INTO response_revisions(response_id,revision_no,client_event_id) VALUES($1,2,$2) RETURNING id',
              [response.id, randomUUID()]
            )
          ).rows[0];
          await app.query('INSERT INTO response_choice_values VALUES($1,$2,1)', [rr.id, other.id]);
        }),
        (e) => e.code === '23514'
      );
    }
  );
  await check('ordered answers allow clearing and reject incomplete permutations', async () => {
    const {
      rows: [item],
    } = await app.query(
      "SELECT li.id,i.id AS input_id FROM lesson_items li JOIN task_versions tv ON tv.id=li.task_version_id JOIN task_inputs i ON i.task_version_id=tv.id WHERE tv.type_code='word_ordering'"
    );
    const si = (
      await app.query(
        'INSERT INTO session_items(session_id,lesson_item_id) VALUES($1,$2) RETURNING id',
        [fixture.session, item.id]
      )
    ).rows[0];
    const response = (
      await app.query(
        'INSERT INTO responses(input_id,session_item_id) VALUES($1,$2) RETURNING id',
        [item.input_id, si.id]
      )
    ).rows[0];
    const choices = (
      await app.query(
        'SELECT choice_id FROM task_input_choices WHERE input_id=$1 ORDER BY choice_id',
        [item.input_id]
      )
    ).rows;
    await assert.rejects(
      transaction(app, async () => {
        const rr = (
          await app.query(
            'INSERT INTO response_revisions(response_id,revision_no,client_event_id) VALUES($1,1,$2) RETURNING id',
            [response.id, randomUUID()]
          )
        ).rows[0];
        await app.query('INSERT INTO response_choice_values VALUES($1,$2,1)', [
          rr.id,
          choices[0].choice_id,
        ]);
      }),
      (e) => e.code === '23514'
    );
    await transaction(app, async () => {
      const rr = (
        await app.query(
          'INSERT INTO response_revisions(response_id,revision_no,client_event_id) VALUES($1,1,$2) RETURNING id',
          [response.id, randomUUID()]
        )
      ).rows[0];
      for (const [i, ch] of choices.entries())
        await app.query('INSERT INTO response_choice_values VALUES($1,$2,$3)', [
          rr.id,
          ch.choice_id,
          i + 1,
        ]);
    });
    await app.query(
      'INSERT INTO response_revisions(response_id,revision_no,client_event_id) VALUES($1,2,$2)',
      [response.id, randomUUID()]
    );
    assert.equal(
      (
        await app.query('SELECT is_answered FROM latest_responses WHERE response_id=$1', [
          response.id,
        ])
      ).rows[0].is_answered,
      false
    );
  });
  await check('dictionary and ER diagram cover every actual table and FK', async () => {
    const dictionary = await readFile(root + 'docs/database/data-dictionary.md', 'utf8');
    const diagram = await readFile(root + 'docs/database/logical-schema.md', 'utf8');
    const { rows: tables } = await dbAdmin.query(
      "SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','private') AND tablename<>'_prisma_migrations'"
    );
    for (const t of tables) {
      assert(dictionary.includes('## ' + t.schemaname + '.' + t.tablename + '\n'));
      assert(diagram.includes(t.schemaname + '_' + t.tablename + ' {'));
    }
    const { rows: constraints } = await dbAdmin.query(
      "SELECT n.nspname,c.relname,k.conname FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE k.contype='f' AND n.nspname IN ('public','private')"
    );
    for (const k of constraints) assert(dictionary.includes(k.conname));
    assert.equal(constraints.length, 50);
  });
  await check('retirement and unlinking are rejected during active lesson', async () => {
    await reject('SELECT public.retire_account($1)', [fixture.student]);
    await reject('UPDATE tutor_students SET ended_at=now() WHERE student_id=$1', [fixture.student]);
  });
  await check(
    'concurrent end waits for answer transaction; no answer/chat writes after end',
    async () => {
      const other = await connect(urlFor('tutor_app', passwords.tutor_app));
      opened.push(other);
      await app.query('BEGIN');
      await app.query(
        'INSERT INTO response_revisions(response_id,revision_no,client_event_id,text_value) VALUES($1,3,$2,$3)',
        [live.response_id, randomUUID(), 'hello']
      );
      await other.query("SET lock_timeout='150ms'");
      await assert.rejects(
        other.query('SELECT public.end_session($1)', [fixture.session]),
        (e) => e.code === '55P03'
      );
      await app.query('COMMIT');
      await other.query('SELECT public.end_session($1)', [fixture.session]);
      await reject(
        'INSERT INTO response_revisions(response_id,revision_no,client_event_id,text_value) VALUES($1,4,$2,$3)',
        [live.response_id, randomUUID(), 'late']
      );
      await reject(
        'INSERT INTO chat_messages(session_id,sender_id,client_message_id,body) VALUES($1,$2,$3,$4)',
        [fixture.session, fixture.student, randomUUID(), 'late']
      );
    }
  );
  await check('concurrent submit waits for draft answer transaction then freezes it', async () => {
    const {
      rows: [hi],
    } = await app.query(
      'SELECT hi.id,i.id AS input_id FROM homework_items hi JOIN task_inputs i ON i.task_version_id=hi.task_version_id WHERE hi.assignment_id=$1',
      [draft.assignment_id]
    );
    const response = (
      await app.query(
        'INSERT INTO responses(input_id,homework_revision_id,homework_item_id) VALUES($1,$2,$3) RETURNING id',
        [hi.input_id, draft.id, hi.id]
      )
    ).rows[0];
    const other = opened[0];
    await other.query("SET lock_timeout='150ms'");
    await app.query('BEGIN');
    await app.query(
      'INSERT INTO response_revisions(response_id,revision_no,client_event_id,text_value) VALUES($1,1,$2,$3)',
      [response.id, randomUUID(), 'An example.']
    );
    await assert.rejects(
      other.query('UPDATE homework_revisions SET submitted_at=now() WHERE id=$1', [draft.id]),
      (e) => e.code === '55P03'
    );
    await app.query('COMMIT');
    await other.query('UPDATE homework_revisions SET submitted_at=now() WHERE id=$1', [draft.id]);
    await reject(
      'INSERT INTO response_revisions(response_id,revision_no,client_event_id,text_value) VALUES($1,2,$2,$3)',
      [response.id, randomUUID(), 'late']
    );
  });
  await check(
    'publishing incomplete content and cross-version key choices is rejected',
    async () => {
      await assert.rejects(
        transaction(app, async () => {
          const task = (
            await app.query('INSERT INTO tasks(owner_id) VALUES($1) RETURNING id', [fixture.tutor])
          ).rows[0];
          const v = (
            await app.query(
              "INSERT INTO task_versions(task_id,version_no,type_code,title,prompt) VALUES($1,1,'single_choice','Draft','Choose') RETURNING id",
              [task.id]
            )
          ).rows[0];
          await app.query('UPDATE task_versions SET published_at=now() WHERE id=$1', [v.id]);
        }),
        (e) => e.code === '23514'
      );
      await assert.rejects(
        transaction(app, async () => {
          const task = (
            await app.query('INSERT INTO tasks(owner_id) VALUES($1) RETURNING id', [fixture.tutor])
          ).rows[0];
          const v = (
            await app.query(
              "INSERT INTO task_versions(task_id,version_no,type_code,title,prompt) VALUES($1,1,'single_choice','Draft','Choose') RETURNING id",
              [task.id]
            )
          ).rows[0];
          const input = (
            await app.query(
              "INSERT INTO task_inputs(task_version_id,position,kind_code,label) VALUES($1,1,'single_choice','Pick') RETURNING id",
              [v.id]
            )
          ).rows[0];
          const other = (await app.query('SELECT id FROM task_choices LIMIT 1')).rows[0];
          await app.query(
            'INSERT INTO private.task_choice_keys(input_id,choice_id) VALUES($1,$2)',
            [input.id, other.id]
          );
        }),
        (e) => e.code === '23514'
      );
    }
  );
  await check('retirement removes credentials, preserves history and is idempotent', async () => {
    const counts = async () =>
      JSON.stringify(
        (
          await app.query(
            'SELECT (SELECT count(*) FROM response_revisions) AS answers,(SELECT count(*) FROM sessions) AS lessons,(SELECT count(*) FROM homework_revisions) AS homework'
          )
        ).rows
      );
    const before = await counts();
    await app.query('SELECT public.retire_account($1)', [fixture.student]);
    await app.query('SELECT public.retire_account($1)', [fixture.student]);
    assert.equal(await counts(), before);
    const {
      rows: [u],
    } = await app.query('SELECT * FROM users WHERE id=$1', [fixture.student]);
    assert.equal(u.auth_epoch, 1);
    assert.equal(u.name, 'Retired');
    assert.equal(u.lastname, 'Account');
    assert.equal(u.email, `retired-${fixture.student}@retired.invalid`);
    assert(u.retired_at);
    assert.equal(
      (
        await app.query('SELECT * FROM private.user_credentials WHERE user_id=$1', [
          fixture.student,
        ])
      ).rowCount,
      0
    );
    await reject('INSERT INTO private.user_credentials(user_id,password_hash) VALUES($1,$2)', [
      fixture.student,
      '$argon2id$invalid',
    ]);
    await reject("UPDATE users SET timezone='Europe/Warsaw' WHERE id=$1", [fixture.student]);
    await assert.rejects(
      app.query("UPDATE users SET name='Restored' WHERE id=$1", [fixture.student]),
      (error) => error.code === '42501'
    );
  });
  await check('tutor retirement revokes outstanding invitations', async () => {
    const invitation = (
      await app.query(
        "INSERT INTO tutor_invitations(tutor_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 day') RETURNING id",
        [fixture.tutor, randomBytes(32).toString('hex')]
      )
    ).rows[0];
    await app.query('SELECT public.retire_account($1)', [fixture.tutor]);
    assert(
      (await app.query('SELECT revoked_at FROM tutor_invitations WHERE id=$1', [invitation.id]))
        .rows[0].revoked_at
    );
  });
  if (process.argv.includes('--auth')) {
    await check(
      'US01–US03 HTTP, WebSocket and invitation contracts against isolated PostgreSQL',
      async () => {
        command(
          process.execPath,
          [
            '--experimental-vm-modules',
            join(root, 'node_modules/jest/bin/jest.js'),
            '--runInBand',
            '--testPathPatterns',
            'auth.e2e-spec.ts|session-storage.e2e-spec.ts|connections.*e2e-spec.ts',
          ],
          {
            cwd: join(root, 'api'),
            stdio: 'inherit',
            env: {
              ...process.env,
              AUTH_TEST_DATABASE_URL: urlFor('tutor_app', passwords.tutor_app),
            },
          }
        );
      }
    );
  }
  console.log(`Passed ${passed} database checks on PostgreSQL 18.`);
  await dbAdmin.end();
  dbAdmin = null;
  for (const c of [app, reporter, migrator, ...opened]) await c.end();
  app = reporter = migrator = null;
  opened.length = 0;
  await admin.query(`DROP DATABASE ${identifier(name)}`);
  testDatabase = null;
} finally {
  for (const c of [app, reporter, migrator, dbAdmin, ...opened])
    if (c) await c.end().catch(() => {});
  if (testDatabase && admin)
    await admin.query(`DROP DATABASE ${identifier(testDatabase)}`).catch(() => {});
  if (admin) await admin.end().catch(() => {});
  if (started)
    command(join(bin, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', 'stop']);
  if (directory) await rm(directory, { recursive: true, force: true });
}
