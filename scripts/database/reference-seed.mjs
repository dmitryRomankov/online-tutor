import { connect, isMain, transaction } from './lib.mjs';
// Keep the migration lookup baseline authoritative; this is safe to replay.
export const reference = {
  roles: [
    ['TUTOR', 'Tutor'],
    ['STUDENT', 'Student'],
  ],
  task_types: [
    ['single_choice', 'Single choice', 'automatic'],
    ['fill_blanks', 'Fill in the blanks', 'automatic'],
    ['written_response', 'Written response', 'manual'],
    ['multiple_selection', 'Multiple selection', 'automatic'],
    ['true_false', 'True / false', 'automatic'],
    ['matching', 'Matching', 'automatic'],
    ['word_ordering', 'Word ordering', 'automatic'],
    ['categorization', 'Categorization', 'automatic'],
    ['error_correction', 'Error correction', 'automatic'],
    ['image_labeling', 'Image labeling', 'automatic'],
  ],
  input_kinds: [
    ['text', 'Text'],
    ['single_choice', 'Single choice'],
    ['multi_choice', 'Multiple choices'],
    ['ordered_choices', 'Ordered choices'],
  ],
  lesson_item_kinds: [
    ['text', 'Text'],
    ['image', 'Image'],
    ['link', 'Link'],
    ['task', 'Task'],
  ],
  session_states: [
    ['scheduled', 'Scheduled'],
    ['active', 'Active'],
    ['ended', 'Ended'],
    ['cancelled', 'Cancelled'],
  ],
};
export async function seedReference(client) {
  await transaction(client, async () => {
    await client.query('SET LOCAL ROLE tutor_owner');
    for (const [table, rows] of Object.entries(reference))
      for (const row of rows) {
        await client.query(
          `INSERT INTO public.${table} VALUES (${row.map((_, i) => '$' + (i + 1)).join(',')}) ON CONFLICT(code) DO NOTHING`,
          row
        );
        const actual = (await client.query(`SELECT * FROM public.${table} WHERE code=$1`, [row[0]]))
          .rows[0];
        if (JSON.stringify(Object.values(actual)) !== JSON.stringify(row))
          throw new Error(`Lookup drift: ${table}/${row[0]}`);
      }
  });
}
if (isMain(import.meta.url)) {
  const c = await connect(process.env.MIGRATION_DATABASE_URL);
  try {
    await seedReference(c);
    console.log('Lookup rows verified.');
  } finally {
    await c.end();
  }
}
