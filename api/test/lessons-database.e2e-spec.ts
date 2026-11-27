import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import sharp from 'sharp';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.js';
import { LessonImageStorage, maxImageBytes } from '../src/lessons/application/lesson-images.js';
import { Schedule } from '../src/lessons/application/schedule.js';
import { PostgresSchedule } from '../src/lessons/infrastructure/postgres-schedule.js';
import type { LessonItem } from '../src/lessons/application/lessons.js';

class MemoryImages implements LessonImageStorage {
  readonly files = new Map<string, Uint8Array>();
  async put(key: string, data: Uint8Array) {
    this.files.set(key, data);
  }
  async get(key: string) {
    const data = this.files.get(key);
    if (!data) return undefined;
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });
  }
  async delete(key: string) {
    this.files.delete(key);
  }
}

const url = process.env.AUTH_TEST_DATABASE_URL;
const databaseDescribe = url ? describe : describe.skip;

databaseDescribe('US07 reusable lessons', () => {
  let app: INestApplication;
  let db: pg.Client;
  let png: Buffer;
  const storage = new MemoryImages();
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#15803d' } })
      .png()
      .toBuffer();
    db = new pg.Client({ connectionString: url });
    await db.connect();
    await db.query('DELETE FROM private.auth_rate_limits');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          DATABASE_URL: url,
          SESSION_SECRET: 'isolated-postgres-lesson-test-secret',
          CLIENT_ORIGIN: 'http://localhost:3000',
          NODE_ENV: 'test',
        })
      )
      .overrideProvider(LessonImageStorage)
      .useValue(storage)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  async function register(role: 'TUTOR' | 'STUDENT') {
    const result = await api()
      .post('/api/auth/register')
      .send({
        name: 'Alex',
        lastname: 'Rivera',
        email: `lesson.${randomUUID()}@example.test`,
        password: 'abcde',
        role,
      })
      .expect(201);
    return {
      id: result.body.user.id as string,
      cookie: result.headers['set-cookie'][0].split(';')[0] as string,
    };
  }

  const taskInput = {
    type: 'written_response',
    title: 'Reflection',
    prompt: 'How was your weekend?',
  };

  async function createTask(cookie: string) {
    return (await api().post('/api/tasks').set('Cookie', cookie).send(taskInput).expect(201)).body;
  }

  async function uploadImage(cookie: string) {
    return (
      await api()
        .post('/api/lessons/images')
        .set('Cookie', cookie)
        .attach('file', png, { filename: 'lesson.png', contentType: 'image/png' })
        .expect(201)
    ).body.id as string;
  }

  it('validates bytes and limits, supports all image formats, and checks ownership before reading the blob', async () => {
    const tutor = await register('TUTOR');
    const other = await register('TUTOR');
    const student = await register('STUDENT');
    await api().post('/api/lessons/images').attach('file', png, 'lesson.png').expect(401);
    await api()
      .post('/api/lessons/images')
      .set('Cookie', student.cookie)
      .attach('file', png, 'lesson.png')
      .expect(403);
    await api()
      .post('/api/lessons/images')
      .set('Cookie', tutor.cookie)
      .attach('file', Buffer.from('not a picture'), 'lesson.png')
      .expect(400);
    await api()
      .post('/api/lessons/images')
      .set('Cookie', tutor.cookie)
      .attach('file', Buffer.alloc(maxImageBytes + 1), 'large.png')
      .expect(413);

    const jpeg = await sharp(png).jpeg().toBuffer();
    const webp = await sharp(png).webp().toBuffer();
    for (const { data, suffix, mime } of [
      { data: png, suffix: 'png', mime: 'image/png' },
      { data: jpeg, suffix: 'jpeg', mime: 'image/jpeg' },
      { data: webp, suffix: 'webp', mime: 'image/webp' },
    ]) {
      const result = await api()
        .post('/api/lessons/images')
        .set('Cookie', tutor.cookie)
        .attach('file', data, `lesson.${suffix}`)
        .expect(201);
      expect(result.body).toEqual({ id: expect.any(String) });
      const path = `/api/lessons/images/${result.body.id}`;
      await api().get(path).set('Cookie', other.cookie).expect(404);
      await api().get(path).set('Cookie', student.cookie).expect(403);
      const image = await api()
        .get(path)
        .set('Cookie', tutor.cookie)
        .expect(200)
        .expect('Content-Type', mime)
        .expect('Cache-Control', 'private, no-store');
      expect(image.body).toEqual(data);
      const {
        rows: [asset],
      } = await db.query('SELECT object_key,media_type,byte_size FROM assets WHERE id=$1', [
        result.body.id,
      ]);
      expect(asset.object_key).toMatch(/^lesson-images\//);
      expect(asset.media_type).toBe(mime);
      expect(Number(asset.byte_size)).toBe(data.length);
      expect(storage.files.get(asset.object_key)).toEqual(data);
    }
  });

  it('reopens mixed blocks in order and rejects foreign attachments, malformed links and stale edits', async () => {
    const tutor = await register('TUTOR');
    const other = await register('TUTOR');
    const student = await register('STUDENT');
    const task = await createTask(tutor.cookie);
    const otherTask = await createTask(other.cookie);
    const ownedImage = await uploadImage(tutor.cookie);
    const otherImage = await uploadImage(other.cookie);
    const items: LessonItem[] = [
      { kind: 'text', text: 'Describe your weekend.' },
      { kind: 'image', assetId: ownedImage },
      { kind: 'task', taskVersionId: task.versionId },
      { kind: 'link', url: 'https://example.test/grammar' },
    ];
    const input = { title: 'Weekend practice', items };
    const create = (body: object, cookie = tutor.cookie) =>
      api().post('/api/lessons').set('Cookie', cookie).send(body);
    await api().get('/api/lessons').expect(401);
    await create(input, student.cookie).expect(403);
    const {
      rows: [draft],
    } = await db.query(
      "INSERT INTO task_versions(task_id,version_no,type_code,title,prompt) VALUES($1,2,'written_response','Draft','Prompt') RETURNING id",
      [task.id]
    );
    for (const invalid of [
      [],
      [{ kind: 'task', taskVersionId: draft.id }],
      [{ kind: 'task', taskVersionId: otherTask.versionId }],
      [{ kind: 'image', assetId: otherImage }],
      [{ kind: 'link', url: 'javascript:alert(0)' }],
      [{ kind: 'document', assetId: ownedImage }],
    ]) {
      await create({ ...input, items: invalid }).expect(400);
    }
    expect((await db.query('SELECT id FROM lessons WHERE owner_id=$1', [tutor.id])).rowCount).toBe(
      0
    );
    const { body: lesson } = await create(input).expect(201);
    expect(lesson).toMatchObject({ ...input, version: 1 });
    const path = `/api/lessons/${lesson.id}`;
    await api().get(path).set('Cookie', tutor.cookie).expect(200, lesson);
    await api().get(path).set('Cookie', other.cookie).expect(404);
    await api().get('/api/lessons').set('Cookie', other.cookie).expect(200, []);
    await api().get(`/api/lessons/tasks/${task.versionId}`).set('Cookie', other.cookie).expect(404);
    const preview = await api()
      .get(`/api/lessons/tasks/${task.versionId}`)
      .set('Cookie', tutor.cookie)
      .expect(200);
    expect(preview.body).toEqual({
      title: taskInput.title,
      prompt: taskInput.prompt,
      version: 1,
      type: 'written_response',
      passage: null,
      choices: [],
      latest: { versionId: task.versionId, version: 1, title: taskInput.title },
    });
    const otherFormats = [
      {
        input: {
          type: 'single_choice',
          title: 'Past tense',
          prompt: 'Select the verb.',
          choices: ['Walked', 'Walk'],
          correctChoiceIndex: 0,
        },
        preview: { passage: null, choices: ['Walked', 'Walk'] },
      },
      {
        input: {
          type: 'fill_blanks',
          title: 'Past tense blanks',
          prompt: 'Complete the sentence.',
          passage: 'Yesterday I [1] home.',
          blanks: [['walked']],
        },
        preview: { passage: 'Yesterday I [1] home.', choices: [] },
      },
    ];
    for (const { input, preview: content } of otherFormats) {
      const { body: published } = await api()
        .post('/api/tasks')
        .set('Cookie', tutor.cookie)
        .send(input)
        .expect(201);
      await api()
        .get(`/api/lessons/tasks/${published.versionId}`)
        .set('Cookie', tutor.cookie)
        .expect(200, {
          type: input.type,
          title: input.title,
          prompt: input.prompt,
          version: 1,
          ...content,
          latest: { versionId: published.versionId, version: 1, title: input.title },
        });
    }
    const { body: latestTask } = await api()
      .put(`/api/tasks/${task.id}`)
      .set('Cookie', tutor.cookie)
      .send({ ...taskInput, prompt: 'New prompt.', expectedVersion: 1 })
      .expect(200);
    await api()
      .get(`/api/lessons/tasks/${task.versionId}`)
      .set('Cookie', tutor.cookie)
      .expect(200, {
        ...preview.body,
        latest: {
          versionId: latestTask.versionId,
          version: latestTask.version,
          title: taskInput.title,
        },
      });

    await create({ title: 'New', items: [{ kind: 'task', taskVersionId: task.versionId }] }).expect(
      409
    );
    const { body: fresh } = await create({
      title: 'New',
      items: [{ kind: 'task', taskVersionId: latestTask.versionId }],
    }).expect(201);
    const reordered = [...lesson.items].reverse();
    const retained = reordered.find((item: LessonItem) => item.kind === 'task');
    for (const invalid of [[retained, retained], [fresh.items[0]]]) {
      await api()
        .put(path)
        .set('Cookie', tutor.cookie)
        .send({ title: lesson.title, items: invalid, expectedVersion: 1 })
        .expect(400);
    }
    const edit = (cookie = tutor.cookie) =>
      api()
        .put(path)
        .set('Cookie', cookie)
        .send({ title: 'Weekend practice updated', items: reordered, expectedVersion: 1 });
    await edit(other.cookie).expect(404);
    const results = await Promise.all([edit(), edit()]);
    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
    const updated = results.find(({ status }) => status === 200)!.body;
    expect(updated.version).toBe(2);
    expect(
      updated.items.map((item: LessonItem) =>
        item.kind === 'task' ? { kind: item.kind, taskVersionId: item.taskVersionId } : item
      )
    ).toEqual([...items].reverse());
    await api().get(path).set('Cookie', tutor.cookie).expect(200, updated);
    const { rows } = await db.query(
      'SELECT kind_code FROM lesson_items WHERE lesson_version_id=$1 ORDER BY position',
      [lesson.versionId]
    );
    expect(rows.map(({ kind_code }) => kind_code)).toEqual(items.map(({ kind }) => kind));
  });

  it('reuses a published lesson in two sessions with independent answers', async () => {
    const tutor = await register('TUTOR');
    const student = await register('STUDENT');
    const task = await createTask(tutor.cookie);
    const { body: lesson } = await api()
      .post('/api/lessons')
      .set('Cookie', tutor.cookie)
      .send({ title: 'Reflection', items: [{ kind: 'task', taskVersionId: task.versionId }] })
      .expect(201);
    const {
      rows: [link],
    } = await db.query(
      'INSERT INTO tutor_students(tutor_id,student_id) VALUES($1,$2) RETURNING id',
      [tutor.id, student.id]
    );
    const other = await register('TUTOR');
    async function writeInSession(text: string) {
      const {
        rows: [session],
      } = await db.query(
        'INSERT INTO sessions(tutor_student_id,planned_lesson_id,scheduled_start,duration_minutes) VALUES($1,$2,now(),60) RETURNING id',
        [link.id, lesson.id]
      );
      const url = `/api/sessions/${session.id}`;
      await api().get(`${url}/content-version`).set('Cookie', other.cookie).expect(404);
      await api().post(`${url}/start`).set('Cookie', student.cookie).expect(403);
      await api().post(`${url}/start`).set('Cookie', other.cookie).expect(404);
      const start = () => api().post(`${url}/start`).set('Cookie', tutor.cookie).expect(200);
      const [first, duplicate] = await Promise.all([start(), start()]);
      expect(first.body).toEqual(duplicate.body);
      expect(first.body).toMatchObject({ state: 'active', version: { id: lesson.versionId } });
      const {
        rows: [item],
      } = await db.query(
        'INSERT INTO session_items(session_id,lesson_item_id) SELECT $1,id FROM lesson_items WHERE lesson_version_id=$2 RETURNING id',
        [session.id, lesson.versionId]
      );
      await db.query('INSERT INTO session_active_items(session_id,session_item_id) VALUES($1,$2)', [
        session.id,
        item.id,
      ]);
      const {
        rows: [response],
      } = await db.query(
        'INSERT INTO responses(input_id,session_item_id) SELECT id,$1 FROM task_inputs WHERE task_version_id=$2 RETURNING id',
        [item.id, task.versionId]
      );
      await db.query(
        'INSERT INTO response_revisions(response_id,revision_no,client_event_id,text_value) VALUES($1,1,$2,$3)',
        [response.id, randomUUID(), text]
      );
      await db.query('SELECT public.end_session($1)', [session.id]);
      return { id: session.id, text };
    }
    const first = await writeInSession('First answer');
    const second = await writeInSession('Second answer');
    await api()
      .put(`/api/lessons/${lesson.id}`)
      .set('Cookie', tutor.cookie)
      .send({ title: 'Edited later', items: lesson.items, expectedVersion: 1 })
      .expect(200);
    for (const session of [first, second]) {
      await api()
        .get(`/api/sessions/${session.id}/content-version`)
        .set('Cookie', tutor.cookie)
        .expect(200, {
          id: session.id,
          state: 'ended',
          version: { id: lesson.versionId, number: 1, title: 'Reflection', activityCount: 1 },
        });
      await api().post(`/api/sessions/${session.id}/start`).set('Cookie', tutor.cookie).expect(409);
    }
    const { rows } = await db.query(
      `SELECT si.session_id,c.lesson_version_id,lr.text_value
       FROM latest_responses lr JOIN session_items si ON si.id=lr.session_item_id
       JOIN session_content c ON c.session_id=si.session_id WHERE si.session_id=ANY($1::uuid[])`,
      [[first.id, second.id]]
    );
    expect(rows).toHaveLength(2);
    for (const { id, text } of [first, second]) {
      expect(rows).toContainEqual({
        session_id: id,
        lesson_version_id: lesson.versionId,
        text_value: text,
      });
    }
  });
  it('waits for concurrent publication before pinning and preserves old homework task references', async () => {
    const tutor = await register('TUTOR');
    const student = await register('STUDENT');
    const task = await createTask(tutor.cookie);
    const { body: lesson } = await api()
      .post('/api/lessons')
      .set('Cookie', tutor.cookie)
      .send({ title: 'Before publication', items: [{ kind: 'text', text: 'Before' }] })
      .expect(201);
    const {
      rows: [link],
    } = await db.query(
      'INSERT INTO tutor_students(tutor_id,student_id) VALUES($1,$2) RETURNING id',
      [tutor.id, student.id]
    );
    const {
      rows: [session],
    } = await db.query(
      'INSERT INTO sessions(tutor_student_id,planned_lesson_id,scheduled_start,duration_minutes) VALUES($1,$2,now(),60) RETURNING id',
      [link.id, lesson.id]
    );
    const path = `/api/sessions/${session.id}`;
    await api()
      .get(`${path}/content-version`)
      .set('Cookie', tutor.cookie)
      .expect(200, {
        id: session.id,
        state: 'scheduled',
        version: { id: lesson.versionId, number: 1, title: lesson.title, activityCount: 1 },
      });

    async function assign(version: string) {
      const {
        rows: [assignment],
      } = await db.query(
        "INSERT INTO homework_assignments(tutor_student_id,title) VALUES($1,'Practice') RETURNING id",
        [link.id]
      );
      await db.query(
        'INSERT INTO homework_items(assignment_id,position,task_version_id) VALUES($1,1,$2)',
        [assignment.id, version]
      );
      await db.query('INSERT INTO homework_revisions(assignment_id,revision_no) VALUES($1,1)', [
        assignment.id,
      ]);
      return assignment.id;
    }
    const oldAssignment = await assign(task.versionId);
    const { body: updatedTask } = await api()
      .put(`/api/tasks/${task.id}`)
      .set('Cookie', tutor.cookie)
      .send({ ...taskInput, prompt: 'Updated prompt', expectedVersion: 1 })
      .expect(200);
    const newAssignment = await assign(updatedTask.versionId);
    for (const [id, versionId] of [
      [oldAssignment, task.versionId],
      [newAssignment, updatedTask.versionId],
    ]) {
      const { rows } = await db.query(
        'SELECT task_version_id FROM homework_items WHERE assignment_id=$1',
        [id]
      );
      expect(rows).toEqual([{ task_version_id: versionId }]);
    }

    await db.query('BEGIN');
    let start: Promise<request.Response> | undefined;
    let publishedId: string | undefined;
    try {
      await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [tutor.id]);
      await db.query('SELECT id FROM lessons WHERE id=$1 FOR UPDATE', [lesson.id]);
      const {
        rows: [prepared],
      } = await db.query(
        "INSERT INTO lesson_versions(lesson_id,version_no,title) VALUES($1,2,'After publication') RETURNING id",
        [lesson.id]
      );
      publishedId = prepared.id;
      await db.query(
        "INSERT INTO lesson_items(lesson_version_id,position,kind_code,text_content) VALUES($1,1,'text','After')",
        [publishedId]
      );
      await db.query('UPDATE lesson_versions SET published_at=now() WHERE id=$1', [publishedId]);
      start = api()
        .post(`${path}/start`)
        .set('Cookie', tutor.cookie)
        .then((result) => result);
      let waiting = false;
      for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
        await db.query('SELECT pg_stat_clear_snapshot()');
        const {
          rows: [activity],
        } = await db.query(
          'SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pg_backend_pid()=ANY(pg_blocking_pids(pid))) AS waiting'
        );
        waiting = activity.waiting;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
    } finally {
      await db.query('COMMIT');
      await start;
    }
    expect(await start).toMatchObject({
      status: 200,
      body: { state: 'active', version: { id: publishedId, number: 2 } },
    });
    await api()
      .put(`/api/lessons/${lesson.id}`)
      .set('Cookie', tutor.cookie)
      .send({ title: 'After Start', items: [{ kind: 'text', text: 'Edited' }], expectedVersion: 2 })
      .expect(200);
    const after = await api()
      .get(`${path}/content-version`)
      .set('Cookie', tutor.cookie)
      .expect(200);
    expect(after.body).toEqual((await start)?.body);
    await expect(
      db.query('UPDATE homework_items SET task_version_id=$1 WHERE assignment_id=$2', [
        updatedTask.versionId,
        oldAssignment,
      ])
    ).rejects.toMatchObject({ code: '23514' });
  });
  it('schedules once per submission, allows overlaps and scopes student entry', async () => {
    const tutor = await register('TUTOR');
    const student = await register('STUDENT');
    const stranger = await register('STUDENT');
    const otherTutor = await register('TUTOR');
    const createLesson = async (cookie: string) =>
      (
        await api()
          .post('/api/lessons')
          .set('Cookie', cookie)
          .send({ title: 'Version one', items: [{ kind: 'text', text: 'Practice' }] })
          .expect(201)
      ).body;
    const lesson = await createLesson(tutor.cookie);
    const foreign = await createLesson(otherTutor.cookie);
    const {
      rows: [link],
    } = await db.query(
      'INSERT INTO tutor_students(tutor_id,student_id) VALUES($1,$2) RETURNING id',
      [tutor.id, student.id]
    );
    const input = {
      id: randomUUID(),
      connectionId: link.id,
      lessonId: lesson.id,
      scheduledStart: '2099-11-27T15:00:00+01:00',
      durationMinutes: 45,
    };
    const create = (body = input, cookie = tutor.cookie) =>
      api().post('/api/sessions').set('Cookie', cookie).send(body);
    await create(input, student.cookie).expect(403);
    await create({ ...input, durationMinutes: 0 }).expect(400);
    await create({ ...input, scheduledStart: '2099-11-27T15:00:00' }).expect(400);
    await create({ ...input, lessonId: foreign.id }).expect(404);
    await create(input, otherTutor.cookie).expect(404);
    const [booked, retry] = await Promise.all([create().expect(201), create().expect(201)]);
    expect(booked.body).toEqual(retry.body);
    expect(booked.body).toMatchObject({
      id: input.id,
      state: 'scheduled',
      scheduledStart: '2099-11-27T14:00:00.000Z',
      canJoin: false,
    });
    await create({ ...input, durationMinutes: 60 }).expect(409);
    const overlap = randomUUID();
    await create({ ...input, id: overlap }).expect(201);
    const path = `/api/sessions/${input.id}`;
    for (const actor of [tutor, student]) {
      const { body } = await api().get('/api/sessions').set('Cookie', actor.cookie).expect(200);
      expect(body.sessions.map((row: { id: string }) => row.id).sort()).toEqual(
        [input.id, overlap].sort()
      );
      await api().get(path).set('Cookie', actor.cookie).expect(200);
    }
    await api()
      .get('/api/sessions')
      .set('Cookie', stranger.cookie)
      .expect(200)
      .expect(({ body }) => expect(body.sessions).toEqual([]));
    await api().get(path).set('Cookie', stranger.cookie).expect(404);
    await api().get(`${path}/entry`).set('Cookie', stranger.cookie).expect(404);
    await api()
      .get(`${path}/entry`)
      .set('Cookie', student.cookie)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('schedule_early'));
    await api().get(`${path}/entry`).set('Cookie', tutor.cookie).expect(403);

    const { rows: notifications } = await db.query(
      'SELECT session_id FROM lesson_notifications WHERE session_id=ANY($1::uuid[])',
      [[input.id, overlap]]
    );
    expect(notifications.map(({ session_id }) => session_id).sort()).toEqual(
      [input.id, overlap].sort()
    );
    const { rows: pins } = await db.query(
      'SELECT session_id FROM session_content WHERE session_id=$1',
      [input.id]
    );
    expect(pins).toEqual([]);

    const pool = new pg.Pool({ connectionString: url });
    try {
      const actor = {
        id: student.id,
        role: 'STUDENT' as const,
        name: 'Alex',
        lastname: 'Rivera',
        email: 'known@example.test',
      };
      let now = new Date('2099-11-27T13:59:59.999Z');
      const schedule = new Schedule(new PostgresSchedule(pool), () => now);
      await expect(schedule.studentEntry(actor, input.id)).rejects.toMatchObject({
        code: 'schedule_early',
      });
      now = new Date('2099-11-27T14:00:00.000Z');
      await expect(schedule.studentEntry(actor, input.id)).resolves.toMatchObject({
        canJoin: true,
        state: 'scheduled',
      });

      const { body: edited } = await api()
        .put(`/api/lessons/${lesson.id}`)
        .set('Cookie', tutor.cookie)
        .send({ title: 'Version two', items: lesson.items, expectedVersion: 1 })
        .expect(200);
      const { body: started } = await api()
        .post(`${path}/start`)
        .set('Cookie', tutor.cookie)
        .expect(200);
      expect(started.version.id).toBe(edited.versionId);
      await expect(schedule.studentEntry(actor, input.id)).resolves.toMatchObject({
        title: 'Version two',
        canJoin: true,
        state: 'active',
      });
      await db.query('SELECT public.end_session($1)', [input.id]);
      await expect(schedule.studentEntry(actor, input.id)).rejects.toMatchObject({
        code: 'schedule_closed',
      });
      await db.query("UPDATE sessions SET state_code='cancelled' WHERE id=$1", [overlap]);
      await expect(schedule.studentEntry(actor, overlap)).rejects.toMatchObject({
        code: 'schedule_closed',
      });
      await db.query('UPDATE tutor_students SET ended_at=now() WHERE id=$1', [link.id]);
      await create({ ...input, id: randomUUID() }).expect(404);
    } finally {
      await pool.end();
    }
  });
});
