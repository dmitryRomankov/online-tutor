import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { connect, isMain, transaction } from './lib.mjs';
import { reference } from './reference-seed.mjs';
export async function seedDemo(c, password) {
  if (!password || password.length < 16)
    throw new Error('DEMO_PASSWORD must contain at least 16 characters');
  return transaction(c, async () => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext('online-tutor-demo-v1'))");
    const prior = await c.query("SELECT id FROM public.users WHERE email='demo.tutor@example.test'");
    if (prior.rowCount) return { existing: true };
    const insert = async (table, values) => {
      const columns = Object.keys(values),
        params = Object.values(values);
      return (
        await c.query(
          `INSERT INTO ${table} (${columns.join(',')}) VALUES (${params.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`,
          params
        )
      ).rows[0];
    };
    const tutor = await insert('public.users', {
      role_code: 'TUTOR',
      email: 'demo.tutor@example.test',
      name: 'Demo', lastname: 'Tutor',
    });
    const student = await insert('public.users', {
      role_code: 'STUDENT',
      email: 'demo.student@example.test',
      name: 'Demo', lastname: 'Student',
    });
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    for (const u of [tutor, student])
      await insert('private.user_credentials', { user_id: u.id, password_hash: hash });
    const link = await insert('public.tutor_students', {
      tutor_id: tutor.id,
      student_id: student.id,
    });
    const image = await insert('public.assets', {
      owner_id: tutor.id,
      object_key: 'demo/classroom.png',
      media_type: 'image/png',
      byte_size: 1024,
    });
    const versions = [];
    for (const [code, label] of reference.task_types) {
      const task = await insert('public.tasks', { owner_id: tutor.id });
      const v = await insert('public.task_versions', {
        task_id: task.id,
        version_no: 1,
        type_code: code,
        title: label,
        prompt: `Practice: ${label}.`,
        ...(code === 'image_labeling' ? { image_asset_id: image.id } : {}),
      });
      const kind = [
        'fill_blanks',
        'written_response',
        'error_correction',
        'image_labeling',
      ].includes(code)
        ? 'text'
        : code === 'multiple_selection'
          ? 'multi_choice'
          : code === 'word_ordering'
            ? 'ordered_choices'
            : 'single_choice';
      const inputs = [];
      for (let i = 1; i <= (code === 'fill_blanks' ? 5 : 1); i++) {
        const input = await insert('public.task_inputs', {
          task_version_id: v.id,
          position: i,
          kind_code: kind,
          label: kind === 'text' ? `Complete sentence ${i}` : 'Choose the correct answer',
          ...(code === 'image_labeling' ? { marker_x: 35, marker_y: 45 } : {}),
        });
        const choices = [];
        if (kind === 'text') {
          if (code !== 'written_response')
            await insert('private.task_text_keys', {
              input_id: input.id,
              variant_no: 1,
              accepted_text: 'hello',
            });
        } else {
          for (let j = 1; j <= 2; j++) {
            const choice = await insert('public.task_choices', {
              task_version_id: v.id,
              position: j,
              label:
                code === 'true_false'
                  ? j === 1
                    ? 'True'
                    : 'False'
                  : j === 1
                    ? 'Hello'
                    : 'Goodbye',
            });
            choices.push(choice);
            await insert('public.task_input_choices', { input_id: input.id, choice_id: choice.id });
            if (j === 1 || kind === 'ordered_choices')
              await insert('private.task_choice_keys', {
                input_id: input.id,
                choice_id: choice.id,
                ...(kind === 'ordered_choices' ? { expected_position: j } : {}),
              });
          }
        }
        inputs.push({ ...input, choices });
      }
      await c.query('UPDATE public.task_versions SET published_at=now() WHERE id=$1', [v.id]);
      versions.push({ ...v, inputs });
    }
    const lesson = await insert('public.lessons', { owner_id: tutor.id });
    const lv = await insert('public.lesson_versions', {
      lesson_id: lesson.id,
      version_no: 1,
      title: 'Everyday English',
    });
    const items = [];
    for (const [i, v] of versions.entries())
      items.push(
        await insert('public.lesson_items', {
          lesson_version_id: lv.id,
          position: i + 1,
          kind_code: 'task',
          task_version_id: v.id,
        })
      );
    await c.query('UPDATE public.lesson_versions SET published_at=now() WHERE id=$1', [lv.id]);
    const sessions = [];
    for (let i = 0; i < 4; i++)
      sessions.push(
        await insert('public.sessions', {
          tutor_student_id: link.id,
          planned_lesson_id: lesson.id,
          scheduled_start: new Date(Date.now() + (i - 1) * 86400000),
          duration_minutes: 60,
        })
      );
    await c.query('SELECT public.start_session($1)', [sessions[0].id]);
    await c.query('SELECT public.end_session($1)', [sessions[0].id]);
    await c.query('SELECT public.start_session($1)', [sessions[1].id]);
    await c.query("UPDATE public.sessions SET state_code='cancelled' WHERE id=$1", [
      sessions[3].id,
    ]);
    const si = await insert('public.session_items', {
      session_id: sessions[1].id,
      lesson_item_id: items[1].id,
    });
    await insert('public.session_active_items', {
      session_id: sessions[1].id,
      session_item_id: si.id,
    });
    for (const input of versions[1].inputs.slice(0, 3)) {
      const response = await insert('public.responses', {
        input_id: input.id,
        session_item_id: si.id,
      });
      await insert('public.response_revisions', {
        response_id: response.id,
        revision_no: 1,
        client_event_id: randomUUID(),
        text_value: 'hello',
      });
    }
    const assignment = await insert('public.homework_assignments', {
      tutor_student_id: link.id,
      title: 'Practice at home',
      due_at: new Date(Date.now() + 86400000),
    });
    const hi = await insert('public.homework_items', {
      assignment_id: assignment.id,
      task_version_id: versions[2].id,
      position: 1,
    });
    const hr = await insert('public.homework_revisions', {
      assignment_id: assignment.id,
      revision_no: 1,
    });
    const response = await insert('public.responses', {
      input_id: versions[2].inputs[0].id,
      homework_revision_id: hr.id,
      homework_item_id: hi.id,
    });
    const rr = await insert('public.response_revisions', {
      response_id: response.id,
      revision_no: 1,
      client_event_id: randomUUID(),
      text_value: 'I enjoy learning English.',
    });
    await c.query('UPDATE public.homework_revisions SET submitted_at=now() WHERE id=$1', [hr.id]);
    await insert('public.homework_feedback_comments', {
      response_revision_id: rr.id,
      comment: 'Clear sentence. Add an example next time.',
    });
    return {
      tutor: tutor.id,
      student: student.id,
      session: sessions[1].id,
      sessionItem: si.id,
      homework: hr.id,
    };
  });
}
if (isMain(import.meta.url)) {
  const url = process.env.DATABASE_URL;
  if (!url || !/(_demo|_test)$/.test(new URL(url).pathname.slice(1)))
    throw new Error('Demo seed requires a database name ending in _demo or _test');
  const c = await connect(url);
  try {
    await seedDemo(c, process.env.DEMO_PASSWORD);
    console.log('Synthetic demo data ready.');
  } finally {
    await c.end();
  }
}
