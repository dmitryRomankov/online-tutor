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
        });
    }
    await api()
      .put(`/api/tasks/${task.id}`)
      .set('Cookie', tutor.cookie)
      .send({ ...taskInput, prompt: 'New prompt.', expectedVersion: 1 })
      .expect(200);
    await api()
      .get(`/api/lessons/tasks/${task.versionId}`)
      .set('Cookie', tutor.cookie)
      .expect(200, preview.body);

    const reordered = [...items].reverse();
    const edit = (cookie = tutor.cookie) =>
      api()
        .put(path)
        .set('Cookie', cookie)
        .send({ title: 'Weekend practice updated', items: reordered, expectedVersion: 1 });
    await edit(other.cookie).expect(404);
    const results = await Promise.all([edit(), edit()]);
    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
    const updated = results.find(({ status }) => status === 200)!.body;
    expect(updated).toMatchObject({ items: reordered, version: 2 });
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
    async function writeInSession(text: string) {
      const {
        rows: [session],
      } = await db.query(
        'INSERT INTO sessions(tutor_student_id,planned_lesson_id,scheduled_start,duration_minutes) VALUES($1,$2,now(),60) RETURNING id',
        [link.id, lesson.id]
      );
      await db.query('SELECT public.start_session($1)', [session.id]);
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
});
