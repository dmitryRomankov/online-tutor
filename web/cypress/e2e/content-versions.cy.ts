describe('US08 content versions', () => {
  const lessonId = '0068b22e-6691-4a2f-9c19-b396b4be2166';
  const first = 'f9ce7338-4cd0-4087-854f-8d5d15799a3d';
  const latest = '4244c58b-a1b7-43dc-865d-c58a54f6f244';
  const blockId = '9bdfcc99-6305-4fae-a423-a16f8ab41997';
  const sessionId = 'c935221f-b6ec-4e81-b5fa-ae523ac25e82';

  beforeEach(() => {
    cy.intercept('GET', '**/api/auth/me', {
      body: {
        user: {
          id: 'tutor',
          name: 'Elena',
          lastname: 'Martin',
          email: 'elena@example.test',
          role: 'TUTOR',
        },
      },
    });
    cy.intercept('GET', '**/api/connections', { body: [] });
  });

  for (const width of [1440, 402]) {
    it(`reviews and replaces a preserved attachment at ${width}px`, () => {
      cy.viewport(width, width === 402 ? 874 : 1000);
      const original = { id: lessonId, versionId: first, title: 'Weekend practice', version: 1 };
      const attachment = { kind: 'task', taskVersionId: first, retainedItemId: blockId };
      cy.intercept('GET', `**/api/lessons/${lessonId}`, {
        body: { ...original, items: [attachment, { kind: 'text', text: 'Warm up' }] },
      });
      cy.intercept('GET', '**/api/tasks', {
        body: [
          {
            id: blockId,
            versionId: latest,
            version: 2,
            title: 'Reflection',
            type: 'written_response',
          },
        ],
      });
      for (const versionId of [first, latest]) {
        cy.intercept('GET', `**/api/lessons/tasks/${versionId}`, {
          body: {
            title: 'Reflection',
            version: versionId === first ? 1 : 2,
            type: 'written_response',
            prompt: 'Reflect on the weekend',
            passage: null,
            choices: [],
            latest: { versionId: latest, version: 2, title: 'Reflection' },
          },
        });
      }
      let attempts = 0;
      cy.intercept('PUT', `**/api/lessons/${lessonId}`, (req) => {
        attempts += 1;
        if (attempts === 1) {
          expect(req.body.items[1]).to.deep.equal(attachment);
          req.reply({ body: { ...original, version: 2, items: req.body.items } });
          return;
        }
        expect(req.body.items[1]).to.deep.equal({ kind: 'task', taskVersionId: latest });
        if (attempts === 2) {
          req.reply({ statusCode: 409, body: { code: 'task_version_conflict' } });
          return;
        }
        req.reply({
          body: {
            ...original,
            version: 3,
            title: req.body.title,
            items: [req.body.items[0], { ...req.body.items[1], retainedItemId: blockId }],
          },
        });
      }).as('saveLesson');

      cy.visit(`/tutor/lessons/${lessonId}`);
      cy.contains('button', 'Review attachment').click();
      cy.get('[aria-label="Content versions"]')
        .should('contain.text', 'Attached v1')
        .and('contain.text', 'Latest v2');
      cy.screenshot(`attachment-versions-${width}`, { capture: 'fullPage' });
      cy.contains('button', 'Back to lesson').click();
      cy.get('[aria-label="Move activity 1 down"]').click();
      cy.contains('button', 'Save lesson').click();
      cy.wait('@saveLesson');
      cy.contains('Lesson saved.').should('be.visible');
      cy.get('#lesson-title').clear().type('Draft title');
      cy.contains('button', 'Review attachment').click();
      cy.contains('button', 'Use latest version').click();
      cy.contains('button', 'Save lesson').click();
      cy.wait('@saveLesson').its('response.statusCode').should('eq', 409);
      cy.contains('A task changed.').should('be.visible');
      cy.get('#lesson-title').should('have.value', 'Draft title');
      cy.get('#activity-task-2').should('have.value', latest);
      cy.contains('button', 'Save lesson').click();
      cy.wait('@saveLesson').its('response.statusCode').should('eq', 200);
      cy.contains('Lesson saved.').should('be.visible');
      cy.document().then((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(width));
    });

    it(`shows the version confirmed by Start and the read-only record at ${width}px`, () => {
      cy.viewport(width, width === 402 ? 874 : 1000);
      const version = { id: first, title: 'Prepared lesson', number: 1, activityCount: 1 };
      cy.intercept('GET', `**/api/sessions/${sessionId}/content-version`, {
        body: { id: sessionId, state: 'scheduled', version },
      });
      const locked = { id: latest, title: 'Published while waiting', number: 2, activityCount: 2 };
      let attempts = 0;
      cy.intercept('POST', `**/api/sessions/${sessionId}/start`, (req) => {
        attempts += 1;
        req.reply(
          attempts === 1
            ? { statusCode: 503 }
            : {
                body: { id: sessionId, state: 'active', version: locked },
              }
        );
      });
      cy.visit(`/tutor/sessions/${sessionId}`);
      cy.contains('Latest prepared lesson v1').should('be.visible');
      cy.screenshot(`session-preparation-${width}`, { capture: 'fullPage' });
      cy.contains('button', 'Start lesson').click();
      cy.contains('temporarily unavailable').should('be.visible');
      cy.contains('button', 'Start lesson').click();
      cy.contains('Locked lesson v2').should('be.visible');
      cy.contains('button', 'Start lesson').should('not.exist');
      cy.intercept('GET', `**/api/sessions/${sessionId}/content-version`, {
        body: { id: sessionId, state: 'ended', version: locked },
      });
      cy.reload();
      cy.contains('h1', 'Session record').should('be.visible');
      cy.contains('Locked lesson v2').should('be.visible');
      cy.contains('Completed session content is read-only.').should('be.visible');
      cy.contains('button', 'Start lesson').should('not.exist');
      cy.document().then((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(width));
    });
  }
});
