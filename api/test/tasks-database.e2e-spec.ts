import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.js';
import { PostgresTasks } from '../src/tasks/infrastructure/postgres-tasks.js';

const url = process.env.AUTH_TEST_DATABASE_URL;
const databaseDescribe = url ? describe : describe.skip;
const content = {
  title: 'Past simple',
  prompt: 'Choose the past-tense verb.',
  choices: ['Visited', 'Visit'],
  correctChoiceIndex: 0,
};

databaseDescribe('US04 single-choice tasks against PostgreSQL', () => {
  let app: INestApplication;
  let db: pg.Client;
  const api = () => request(app.getHttpServer());

  async function register(role: 'TUTOR' | 'STUDENT') {
    const response = await api()
      .post('/api/auth/register')
      .send({
        name: 'Alex',
        lastname: 'Rivera',
        email: `${randomUUID()}@example.test`,
        password: 'abcde',
        role,
      })
      .expect(201);
    return {
      id: response.body.user.id as string,
      cookie: response.headers['set-cookie'][0].split(';')[0] as string,
    };
  }

  beforeAll(async () => {
    db = new pg.Client({ connectionString: url });
    await db.connect();
    await db.query('DELETE FROM private.auth_rate_limits');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          DATABASE_URL: url,
          SESSION_SECRET: 'isolated-postgres-single-choice-test-secret',
          CLIENT_ORIGIN: 'http://localhost:3000',
          NODE_ENV: 'test',
        })
      )
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  it('creates an assignable task, lists it without a key, and restricts detail and edits to its owner', async () => {
    const tutor = await register('TUTOR');
    const other = await register('TUTOR');
    const student = await register('STUDENT');
    await api().get('/api/tasks').expect(401);
    await api().post('/api/tasks').set('Cookie', student.cookie).send(content).expect(403);
    const { body: task } = await api()
      .post('/api/tasks')
      .set('Cookie', tutor.cookie)
      .send({ ...content, title: '  Past simple  ' })
      .expect(201);
    expect(task).toMatchObject({ ...content, version: 1 });
    await api()
      .get('/api/tasks')
      .set('Cookie', tutor.cookie)
      .expect(200, [{ id: task.id, version: 1, versionId: task.versionId, title: content.title }]);
    await api().get('/api/tasks').set('Cookie', other.cookie).expect(200, []);
    await api().get(`/api/tasks/${task.id}`).set('Cookie', student.cookie).expect(403);
    await api().get(`/api/tasks/${task.id}`).set('Cookie', other.cookie).expect(404);
    await api()
      .put(`/api/tasks/${task.id}`)
      .set('Cookie', other.cookie)
      .send({ ...content, expectedVersion: 1 })
      .expect(404);
    await api().get(`/api/tasks/${task.id}`).set('Cookie', tutor.cookie).expect(200, task);
  });

  it('rejects incomplete saves and rolls back all rows if publishing fails', async () => {
    const tutor = await register('TUTOR');
    for (const invalid of [
      { ...content, prompt: '   ' },
      { ...content, choices: ['Only one'] },
      { ...content, choices: ['One', ' '] },
      { ...content, correctChoiceIndex: 2 },
      { ...content, correctChoiceIndex: [0, 1] },
    ]) {
      await api().post('/api/tasks').set('Cookie', tutor.cookie).send(invalid).expect(400);
    }
    await expect(
      app.get(PostgresTasks).save(tutor.id, { ...content, correctChoiceIndex: 10 })
    ).rejects.toMatchObject({ code: 'unavailable' });
    const {
      rows: [result],
    } = await db.query('SELECT count(*)::int AS count FROM tasks WHERE owner_id=$1', [tutor.id]);
    expect(result.count).toBe(0);
  });

  it('serializes concurrent edits and preserves assigned versions and their keys', async () => {
    const tutor = await register('TUTOR');
    const other = await register('TUTOR');
    const student = await register('STUDENT');
    const { body: original } = await api()
      .post('/api/tasks')
      .set('Cookie', tutor.cookie)
      .send(content)
      .expect(201);
    const lessonVersion = async (ownerId: string) => {
      const {
        rows: [lesson],
      } = await db.query('INSERT INTO lessons(owner_id) VALUES($1) RETURNING id', [ownerId]);
      const {
        rows: [version],
      } = await db.query(
        "INSERT INTO lesson_versions(lesson_id,version_no,title) VALUES($1,1,'Grammar') RETURNING id",
        [lesson.id]
      );
      return version.id as string;
    };
    const attach = (lessonId: string, taskVersionId: string) =>
      db.query(
        "INSERT INTO lesson_items(lesson_version_id,position,kind_code,task_version_id) VALUES($1,1,'task',$2)",
        [lessonId, taskVersionId]
      );
    const ownedLesson = await lessonVersion(tutor.id);
    await attach(ownedLesson, original.versionId);
    await expect(attach(await lessonVersion(other.id), original.versionId)).rejects.toMatchObject({
      code: '23514',
    });
    const {
      rows: [draft],
    } = await db.query(
      "INSERT INTO task_versions(task_id,version_no,type_code,title,prompt) VALUES($1,2,'single_choice','Draft','Prompt') RETURNING id",
      [original.id]
    );
    await expect(attach(await lessonVersion(tutor.id), draft.id)).rejects.toMatchObject({
      code: '23514',
    });

    const edit = () =>
      api()
        .put(`/api/tasks/${original.id}`)
        .set('Cookie', tutor.cookie)
        .send({
          ...content,
          title: 'Updated past simple',
          correctChoiceIndex: 1,
          expectedVersion: 1,
        });
    const results = await Promise.all([edit(), edit()]);
    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
    const saved = results.find(({ status }) => status === 200)!.body;
    expect(saved).toMatchObject({ id: original.id, version: 3, correctChoiceIndex: 1 });
    await api().get(`/api/tasks/${original.id}`).set('Cookie', tutor.cookie).expect(200, saved);
    const { rows } = await db.query(
      `SELECT li.task_version_id,c.label FROM public.lesson_items li
       JOIN public.task_inputs i ON i.task_version_id=li.task_version_id
       JOIN private.task_choice_keys k ON k.input_id=i.id
       JOIN public.task_choices c ON c.id=k.choice_id
       WHERE li.lesson_version_id=$1`,
      [ownedLesson]
    );
    expect(rows).toEqual([{ task_version_id: original.versionId, label: 'Visited' }]);
    await db.query('UPDATE lesson_versions SET published_at=now() WHERE id=$1', [ownedLesson]);
    const {
      rows: [link],
    } = await db.query(
      'INSERT INTO tutor_students(tutor_id,student_id) VALUES($1,$2) RETURNING id',
      [tutor.id, student.id]
    );
    const {
      rows: [session],
    } = await db.query(
      `INSERT INTO sessions(tutor_student_id,planned_lesson_id,scheduled_start,duration_minutes)
       SELECT $1,lesson_id,now(),60 FROM lesson_versions WHERE id=$2 RETURNING id`,
      [link.id, ownedLesson]
    );
    await db.query('SELECT public.start_session($1)', [session.id]);
    const {
      rows: [item],
    } = await db.query(
      `INSERT INTO session_items(session_id,lesson_item_id)
       SELECT $1,id FROM lesson_items WHERE lesson_version_id=$2 RETURNING id`,
      [session.id, ownedLesson]
    );
    await db.query('INSERT INTO session_active_items(session_id,session_item_id) VALUES($1,$2)', [
      session.id,
      item.id,
    ]);
    const {
      rows: [response],
    } = await db.query(
      `INSERT INTO responses(input_id,session_item_id)
       SELECT id,$1 FROM task_inputs WHERE task_version_id=$2 RETURNING id`,
      [item.id, original.versionId]
    );
    await db.query('BEGIN');
    try {
      const {
        rows: [revision],
      } = await db.query(
        'INSERT INTO response_revisions(response_id,revision_no,client_event_id) VALUES($1,1,$2) RETURNING id',
        [response.id, randomUUID()]
      );
      await db.query(
        `INSERT INTO response_choice_values(response_revision_id,choice_id,position)
         SELECT $1,id,1 FROM task_choices WHERE task_version_id=$2 AND position=1`,
        [revision.id, original.versionId]
      );
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
    const released = () =>
      db.query('SELECT is_correct FROM released_live_results WHERE response_id=$1', [response.id]);
    expect((await released()).rows).toEqual([]);
    await db.query('INSERT INTO feedback_releases(session_item_id) VALUES($1)', [item.id]);
    expect((await released()).rows).toEqual([{ is_correct: true }]);
  });
});
