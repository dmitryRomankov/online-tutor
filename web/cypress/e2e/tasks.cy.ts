describe('US04 single-choice task library and editor', () => {
  const id = '9005c818-b501-43e4-a55b-da483295cb0f';
  const tutor = {
    id: 'tutor',
    name: 'Elena',
    lastname: 'Martin',
    email: 'elena@example.test',
    role: 'TUTOR',
  };
  const versionIds = [
    '4244c58b-a1b7-43dc-865d-c58a54f6f244',
    '04fb763b-9ba5-490b-ac69-b089597e6b6a',
  ];
  const content = {
    title: 'Past simple',
    prompt: 'Choose the past-tense verb.',
    choices: ['Visited', 'Visit'],
    correctChoiceIndex: 0,
  };
  type SavedTask = typeof content & { id: string; version: number; versionId: string };
  let saved: SavedTask | undefined;
  let failCreate: boolean;

  beforeEach(() => {
    saved = undefined;
    failCreate = true;
    cy.intercept('GET', '**/api/auth/me', { body: { user: tutor } });
    cy.intercept('GET', '**/api/connections', { body: [] });
    cy.intercept('GET', '**/api/tasks', (req) => {
      req.reply({
        body: saved
          ? [{ id, title: saved.title, version: saved.version, versionId: saved.versionId }]
          : [],
      });
    }).as('library');
    cy.intercept('GET', `**/api/tasks/${id}`, (req) => {
      req.reply(saved ? { body: saved } : { statusCode: 404 });
    }).as('openTask');
    cy.intercept('POST', '**/api/tasks', (req) => {
      expect(req.body).to.deep.equal(content);
      if (failCreate) {
        failCreate = false;
        req.reply({ statusCode: 503 });
        return;
      }
      saved = { ...content, id, version: 1, versionId: versionIds[0] };
      req.reply({ statusCode: 201, body: saved });
    }).as('createTask');
    cy.intercept('PUT', `**/api/tasks/${id}`, (req) => {
      expect(req.body).to.deep.equal({
        ...content,
        title: 'Past simple practice',
        correctChoiceIndex: 1,
        expectedVersion: 1,
      });
      saved = {
        ...content,
        title: 'Past simple practice',
        correctChoiceIndex: 1,
        id,
        version: 2,
        versionId: versionIds[1],
      };
      req.reply({ body: saved });
    }).as('editTask');
  });

  for (const width of [1440, 402]) {
    it(`validates, previews, recovers from a failed save and edits a task at ${width}px`, () => {
      cy.viewport(width, width === 402 ? 874 : 1000);
      cy.visit('/tutor');
      if (width === 402) {
        cy.get('[aria-label="Account menu"]').click();
        cy.contains('[role="menuitem"]', 'Task library').click();
      } else {
        cy.get('nav')
          .contains('a', /^Tasks$/)
          .click();
      }
      cy.contains('Create your first task.').should('be.visible');
      cy.contains('a', 'Create task').click();
      cy.contains('a', /^Single choice$/).click();
      cy.contains('h1', 'Single choice editor').should('be.visible');

      cy.contains('button', 'Save task').click();
      cy.get('#task-title-error').should('contain', 'Enter a task title.');
      cy.get('#task-prompt-error').should('contain', 'Enter a prompt.');
      cy.get('#correct-answer-error').should('contain', 'Select one correct answer.');
      cy.get('@createTask.all').should('have.length', 0);

      cy.get('#task-title').type(content.title);
      cy.get('#task-prompt').type(content.prompt);
      cy.get('input[name="choices.0.label"]').type(content.choices[0]);
      cy.get('input[name="choices.1.label"]').type(content.choices[1]);
      cy.contains('button', 'Add choice').click();
      cy.get('input[name="choices.2.label"]').type('Extra');
      cy.get('input[name="correctChoice"]').eq(2).check();
      cy.get('[aria-label="Remove choice 3"]').click();
      cy.get('input[name="correctChoice"]:checked').should('not.exist');
      cy.get('input[name="correctChoice"]').first().check();
      cy.screenshot(`single-choice-editor-${width}`, { capture: 'fullPage' });

      cy.contains('button', 'Preview as student').click();
      cy.contains('h2', 'Student preview').should('be.visible');
      cy.get('input[name="previewChoice"]').should('have.length', 2);
      cy.get('input[name="previewChoice"]:checked').should('not.exist');
      cy.contains('button', 'Back to editor').click();
      cy.document().then((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(width));

      cy.contains('button', 'Save task').click();
      cy.wait('@createTask').its('response.statusCode').should('eq', 503);
      cy.contains('Tasks are temporarily unavailable.').should('be.visible');
      cy.get('#task-title').should('have.value', content.title);
      cy.contains('button', 'Save task').click();
      cy.wait('@createTask').its('response.statusCode').should('eq', 201);
      cy.location('pathname').should('eq', '/tutor/tasks');
      cy.get('[aria-label="Edit task: Past simple"]').should(($link) => {
        expect($link[0].getBoundingClientRect().right).to.be.at.most(width);
      });
      cy.contains('a', 'Create task').should(($link) => {
        expect($link[0].getBoundingClientRect().right).to.be.at.most(width);
      });
      cy.screenshot(`task-library-${width}`, { capture: 'viewport' });
      cy.get('#search-tasks').type('no match');
      cy.contains('No tasks match your search.').should('be.visible');
      cy.get('#search-tasks').clear().type('past');
      cy.get('[aria-label="Edit task: Past simple"]').click();
      cy.get('#task-title')
        .should('have.value', content.title)
        .clear()
        .type('Past simple practice');
      cy.get('input[name="correctChoice"]').eq(1).check();
      cy.contains('button', 'Save task').click();
      cy.wait('@editTask');
      cy.contains('Task saved.').should('be.visible');
      cy.contains('Task library · Task v2').should('be.visible');
      cy.reload();
      cy.get('#task-title').should('have.value', 'Past simple practice');
      cy.get('input[name="correctChoice"]').eq(1).should('be.checked');
    });
  }
});
