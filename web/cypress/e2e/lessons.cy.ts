describe('US07 reusable lesson builder', () => {
  const tutor = {
    id: 'tutor',
    name: 'Elena',
    lastname: 'Martin',
    email: 'elena@example.test',
    role: 'TUTOR',
  };
  const lessonId = '0068b22e-6691-4a2f-9c19-b396b4be2166';
  const taskId = '4b8dc2fc-d0a8-491b-86e7-38e75980f46f';
  const taskVersionId = 'f9ce7338-4cd0-4087-854f-8d5d15799a3d';
  const assetId = '9bdfcc99-6305-4fae-a423-a16f8ab41997';
  const title = 'Weekend practice';
  const text = 'Describe your weekend.';
  const url = 'https://example.test/grammar';
  const original = [
    { kind: 'text', text },
    { kind: 'image', assetId },
    { kind: 'task', taskVersionId },
    { kind: 'link', url },
  ];
  let lesson:
    | { id: string; versionId: string; version: number; title: string; items: typeof original }
    | undefined;

  beforeEach(() => {
    lesson = undefined;
    let failUpload = true;
    let failCreate = true;
    cy.intercept('GET', '**/api/auth/me', { body: { user: tutor } });
    cy.intercept('GET', '**/api/connections', { body: [] });
    cy.intercept('GET', '**/api/lessons', (req) => {
      req.reply({
        body: lesson
          ? [
              {
                id: lesson.id,
                title: lesson.title,
                version: lesson.version,
                versionId: lesson.versionId,
              },
            ]
          : [],
      });
    });
    cy.intercept('GET', `**/api/lessons/${lessonId}`, (req) => {
      req.reply(lesson ? { body: lesson } : { statusCode: 404 });
    });
    cy.intercept('GET', '**/api/tasks', {
      body: [
        {
          id: taskId,
          versionId: taskVersionId,
          version: 2,
          title: 'Weekend reflection',
          type: 'written_response',
        },
      ],
    });
    cy.intercept('GET', `**/api/lessons/tasks/${taskVersionId}`, {
      body: {
        title: 'Weekend reflection',
        version: 2,
        type: 'written_response',
        prompt: 'How was your weekend?',
        passage: null,
        choices: [],
      },
    });
    cy.intercept('POST', '**/api/lessons/images', (req) => {
      expect(req.headers['content-type']).to.include('multipart/form-data');
      if (failUpload) {
        failUpload = false;
        req.reply({ statusCode: 503 });
        return;
      }
      req.reply({ statusCode: 201, body: { id: assetId } });
    }).as('uploadImage');
    cy.intercept('GET', `**/api/lessons/images/${assetId}`, {
      headers: {
        'content-type': 'image/png',
        'access-control-allow-origin': new URL(Cypress.config('baseUrl')!).origin,
        'access-control-allow-credentials': 'true',
        'cache-control': 'private, no-store',
      },
      fixture: 'lesson.png,null',
    }).as('readImage');
    cy.intercept('POST', '**/api/lessons', (req) => {
      expect(req.body).to.deep.equal({ title, items: original });
      if (failCreate) {
        failCreate = false;
        req.reply({ statusCode: 503 });
        return;
      }
      lesson = {
        id: lessonId,
        version: 1,
        versionId: '4244c58b-a1b7-43dc-865d-c58a54f6f244',
        title,
        items: original,
      };
      req.reply({ statusCode: 201, body: lesson });
    }).as('createLesson');
    cy.intercept('PUT', `**/api/lessons/${lessonId}`, (req) => {
      const items = [original[0], original[2], original[3]];
      expect(req.body).to.deep.equal({ title: 'Updated lesson', items, expectedVersion: 1 });
      lesson = {
        id: lessonId,
        version: 2,
        versionId: '04fb763b-9ba5-490c-ac69-b089597e6b6a',
        title: 'Updated lesson',
        items,
      };
      req.reply({ body: lesson });
    }).as('editLesson');
  });

  const add = (kind: string) => {
    cy.contains('button', 'Add activity').click();
    cy.get('[aria-label="Activity type"]')
      .contains('button', new RegExp(`^${kind}$`))
      .click();
  };

  for (const width of [1440, 402]) {
    it(`builds, reorders, previews and reopens a reusable lesson at ${width}px`, () => {
      cy.viewport(width, width === 402 ? 874 : 1000);
      cy.visit('/tutor');
      if (width === 402) {
        cy.get('[aria-label="Account menu"]').click();
        cy.contains('[role="menuitem"]', 'Lesson library').click();
      } else {
        cy.get('nav')
          .contains('a', /^Lessons$/)
          .click();
      }
      cy.contains('Create your first lesson.').should('be.visible');
      cy.contains('a', /^Create lesson$/).click();
      cy.contains('h1', 'Lesson builder').should('be.visible');
      cy.contains('button', /^Save lesson$/).click();
      cy.get('#lesson-title-error').should('be.visible');
      cy.contains('Add at least one activity.').should('be.visible');

      cy.get('#lesson-title').type(title);
      add('Text');
      cy.get('#activity-text-1').type(text);
      add('Image');
      cy.get('#activity-image-2').selectFile('cypress/fixtures/lesson.png');
      cy.contains('button', /^Upload image$/).click();
      cy.wait('@uploadImage').its('response.statusCode').should('eq', 503);
      cy.contains('Lesson storage is temporarily unavailable.').should('be.visible');
      cy.get('#activity-text-1').should('have.value', text);
      cy.contains('button', /^Upload image$/).click();
      cy.wait('@uploadImage').its('response.statusCode').should('eq', 201);
      cy.wait('@readImage').its('response.statusCode').should('eq', 200);
      cy.get('img[alt="Lesson image"]')
        .should('have.prop', 'naturalWidth')
        .and('be.greaterThan', 0);

      add('Link');
      cy.get('#activity-link-3').type(url);
      add('Task');
      cy.get('#activity-task-4-search').type('Weekend');
      cy.get('#activity-task-4').select(taskVersionId);
      cy.contains('Written response · Task v2').should('be.visible');
      cy.get('[aria-label="Move activity 4 up"]').focus().should('have.focus').click();
      cy.get('#activity-task-3').should('have.value', taskVersionId);
      cy.get('#activity-link-4').should('have.value', url);
      cy.screenshot(`lesson-builder-${width}`, { capture: 'fullPage' });

      cy.contains('button', 'Preview lesson').click();
      cy.get('[aria-labelledby="lesson-preview"]').within(() => {
        cy.get('ol > li').should('have.length', 4).eq(2).should('contain', 'How was your weekend?');
        cy.get('textarea[aria-label="Your answer"]').should('have.value', '');
        cy.get('a').should('have.attr', 'href', url);
      });
      cy.document().then((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(width));
      cy.contains('button', 'Back to editor').click();
      cy.contains('button', /^Save lesson$/).click();
      cy.wait('@createLesson').its('response.statusCode').should('eq', 503);
      cy.get('#lesson-title').should('have.value', title);
      cy.get('#activity-task-3').should('have.value', taskVersionId);
      cy.contains('button', /^Save lesson$/).click();
      cy.wait('@createLesson').its('response.statusCode').should('eq', 201);

      cy.location('pathname').should('eq', '/tutor/lessons');
      cy.get('#search-lessons').type('missing');
      cy.contains('No lessons match your search.').should('be.visible');
      cy.get('#search-lessons').clear().type('Weekend');
      cy.get('[aria-label="Edit lesson: Weekend practice"]').should('be.visible');
      cy.screenshot(`lesson-library-${width}`, { capture: 'fullPage' });
      cy.get('[aria-label="Edit lesson: Weekend practice"]').click();
      cy.get('#activity-text-1').should('have.value', text);
      cy.get('#activity-task-3').should('have.value', taskVersionId);
      cy.get('[aria-label="Remove activity 2"]').click();
      cy.get('#lesson-title').clear().type('Updated lesson');
      cy.contains('button', /^Save lesson$/).click();
      cy.wait('@editLesson');
      cy.contains('Lesson saved.').should('be.visible');
      cy.reload();
      cy.get('#activity-task-2').should('have.value', taskVersionId);
      cy.get('#activity-link-3').should('have.value', url);
      cy.contains('Lesson library · Lesson v2').should('be.visible');
    });
  }
});
