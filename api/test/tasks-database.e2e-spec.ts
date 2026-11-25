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

const fillBlanks = {
  type: 'fill_blanks',
  title: 'Five past-tense verbs',
  prompt: 'Complete the passage in the past tense.',
  passage: 'I [1] home. We [2] dinner and [3] the table. I [4] a book and [5] a friend.',
  blanks: [['walked', 'went'], ['cooked'], ['cleared'], ['read'], ['called']],
};

databaseDescribe('US04 and US05 task authoring against PostgreSQL', () => {
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

  async function lessonVersion(ownerId: string) {
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
  }

  const attach = (lessonId: string, taskVersionId: string) =>
    db.query(
      "INSERT INTO lesson_items(lesson_version_id,position,kind_code,task_version_id) VALUES($1,1,'task',$2)",
      [lessonId, taskVersionId]
    );

  async function startLive(ownedLesson: string, tutorId: string, studentId: string) {
    await db.query('UPDATE lesson_versions SET published_at=now() WHERE id=$1', [ownedLesson]);
    const {
      rows: [link],
    } = await db.query(
      'INSERT INTO tutor_students(tutor_id,student_id) VALUES($1,$2) RETURNING id',
      [tutorId, studentId]
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
    return item as { id: string };
  }

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
      .expect(200, [
        {
          id: task.id,
          version: 1,
          versionId: task.versionId,
          title: content.title,
          type: 'single_choice',
        },
      ]);
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
      app
        .get(PostgresTasks)
        .save(tutor.id, { ...content, type: 'single_choice', correctChoiceIndex: 10 })
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
    const item = await startLive(ownedLesson, tutor.id, student.id);
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
  it('validates numbered markers and accepted answers and keeps authoring keys private', async () => {
    const tutor = await register('TUTOR');
    const other = await register('TUTOR');
    const student = await register('STUDENT');
    const create = (input: object) =>
      api().post('/api/tasks').set('Cookie', tutor.cookie).send(input);
    for (const invalid of [
      { ...fillBlanks, passage: 'No markers' },
      { ...fillBlanks, passage: '[2] [1] [3] [4] [5]' },
      { ...fillBlanks, passage: '[1] [1] [3] [4] [5]' },
      { ...fillBlanks, blanks: [['only one']] },
      { ...fillBlanks, blanks: [[], ...fillBlanks.blanks.slice(1)] },
      { ...fillBlanks, blanks: [['  '], ...fillBlanks.blanks.slice(1)] },
      { ...fillBlanks, blanks: [['went', ' WENT '], ...fillBlanks.blanks.slice(1)] },
    ]) {
      await create(invalid).expect(400);
    }
    await api().get('/api/tasks').set('Cookie', tutor.cookie).expect(200, []);

    const { body: saved } = await create(fillBlanks).expect(201);
    expect(saved).toMatchObject({ ...fillBlanks, version: 1 });
    await api()
      .get('/api/tasks')
      .set('Cookie', tutor.cookie)
      .expect(200, [
        {
          id: saved.id,
          versionId: saved.versionId,
          version: 1,
          title: fillBlanks.title,
          type: 'fill_blanks',
        },
      ]);
    const path = `/api/tasks/${saved.id}`;
    await api().get(path).set('Cookie', tutor.cookie).expect(200, saved);
    await api().get(path).set('Cookie', other.cookie).expect(404);
    await api().get(path).set('Cookie', student.cookie).expect(403);
    await api()
      .put(path)
      .set('Cookie', other.cookie)
      .send({ ...fillBlanks, expectedVersion: 1 })
      .expect(404);
    await api()
      .put(path)
      .set('Cookie', tutor.cookie)
      .send({ ...content, expectedVersion: 1 })
      .expect(400);
  });

  it('reads older fill-blanks versions with a passage reconstructed from existing input labels', async () => {
    const tutor = await register('TUTOR');
    const {
      rows: [task],
    } = await db.query('INSERT INTO tasks(owner_id) VALUES($1) RETURNING id', [tutor.id]);
    const {
      rows: [version],
    } = await db.query(
      `INSERT INTO task_versions(task_id,version_no,type_code,title,prompt)
       VALUES($1,1,'fill_blanks','Legacy','Complete each sentence.') RETURNING id,passage`,
      [task.id]
    );
    await db.query(
      `INSERT INTO task_inputs(task_version_id,position,kind_code,label)
       SELECT $1,n,'text','Complete sentence ' || n FROM generate_series(1,5) AS n`,
      [version.id]
    );
    await db.query(
      `INSERT INTO private.task_text_keys(input_id,variant_no,accepted_text)
       SELECT id,1,'answer' FROM task_inputs WHERE task_version_id=$1`,
      [version.id]
    );
    await db.query('UPDATE task_versions SET published_at=now() WHERE id=$1', [version.id]);
    expect(version.passage).toBeNull();
    const saved = await app.get(PostgresTasks).find(tutor.id, task.id);
    expect(saved).toMatchObject({
      type: 'fill_blanks',
      passage: Array.from({ length: 5 }, (_, index) => {
        const number = index + 1;
        return `Complete sentence ${number} [${number}]`;
      }).join('\n'),
    });
  });

  it('grades alternatives on the assigned version and reports 60% for three non-whitespace answers', async () => {
    const tutor = await register('TUTOR');
    const student = await register('STUDENT');
    const { body: original } = await api()
      .post('/api/tasks')
      .set('Cookie', tutor.cookie)
      .send(fillBlanks)
      .expect(201);
    const lesson = await lessonVersion(tutor.id);
    await attach(lesson, original.versionId);

    const edit = {
      ...fillBlanks,
      passage: fillBlanks.passage + ' It was a good day.',
      blanks: [['ran'], ...fillBlanks.blanks.slice(1)],
      expectedVersion: 1,
    };
    const path = `/api/tasks/${original.id}`;
    const { body: updated } = await api()
      .put(path)
      .set('Cookie', tutor.cookie)
      .send(edit)
      .expect(200);
    expect(updated).toMatchObject({ passage: edit.passage, blanks: edit.blanks, version: 2 });
    await api().put(path).set('Cookie', tutor.cookie).send(edit).expect(409);

    const {
      rows: [preserved],
    } = await db.query('SELECT passage FROM task_versions WHERE id=$1', [original.versionId]);
    expect(preserved.passage).toBe(fillBlanks.passage);
    const item = await startLive(lesson, tutor.id, student.id);
    await db.query(
      `INSERT INTO responses(input_id,session_item_id)
       SELECT id,$1 FROM task_inputs WHERE task_version_id=$2 AND position<=4`,
      [item.id, original.versionId]
    );
    const { rows: responses } = await db.query(
      `SELECT r.id,i.position FROM responses r JOIN task_inputs i ON i.id=r.input_id
       WHERE r.session_item_id=$1 ORDER BY i.position`,
      [item.id]
    );
    const answers = [' \tWENT\n', 'cooked!', 'cleared', '\t\n\u00a0'];
    for (const [index, answer] of answers.entries()) {
      await db.query(
        'INSERT INTO response_revisions(response_id,revision_no,client_event_id,text_value) VALUES($1,1,$2,$3)',
        [responses[index].id, randomUUID(), answer]
      );
    }
    const {
      rows: [progress],
    } = await db.query(
      'SELECT required_inputs,answered_inputs,answered_percent FROM live_task_progress WHERE session_item_id=$1',
      [item.id]
    );
    expect(progress).toEqual({
      required_inputs: '5',
      answered_inputs: '3',
      answered_percent: '60.00',
    });
    const released = () =>
      db.query(
        `SELECT i.position,e.is_answered,e.is_correct FROM released_live_results e
       JOIN responses r ON r.id=e.response_id JOIN task_inputs i ON i.id=r.input_id
       WHERE e.session_item_id=$1 ORDER BY i.position`,
        [item.id]
      );
    expect((await released()).rows).toEqual([]);
    await db.query('INSERT INTO feedback_releases(session_item_id) VALUES($1)', [item.id]);
    expect((await released()).rows).toEqual([
      { position: 1, is_answered: true, is_correct: true },
      { position: 2, is_answered: true, is_correct: false },
      { position: 3, is_answered: true, is_correct: true },
      { position: 4, is_answered: false, is_correct: false },
    ]);
  });
});
