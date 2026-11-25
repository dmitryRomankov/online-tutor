describe('US05 fill-in-the-blanks authoring', () => {
  const tutor = {
    id: 'tutor',
    name: 'Elena',
    lastname: 'Martin',
    email: 'elena@example.test',
    role: 'TUTOR',
  };
  const id = '9005c818-b501-43e4-a55b-da483295cb0f';
  const versionIds = [
    '4244c58b-a1b7-43dc-865d-c58a54f6f244',
    '04fb763b-9ba5-490b-ac69-b089597e6b6a',
  ];
  const content = {
    type: 'fill_blanks',
    title: 'Past tense practice',
    prompt: 'Complete the passage.',
    passage: 'Yesterday I [1] home and [2] dinner.',
    blanks: [['walked', 'went'], ['cooked']],
  };
  let failCreate: boolean;
  let saved: (typeof content & { id: string; versionId: string; version: number }) | undefined;

  beforeEach(() => {
    failCreate = true;
    saved = undefined;
    cy.intercept('GET', '**/api/auth/me', { body: { user: tutor } });
    cy.intercept('GET', '**/api/tasks', (req) => {
      const choice = {
        id: '4b8dc2fc-d0a8-491b-86e7-38e75980f46f',
        versionId: versionIds[0],
        version: 1,
        type: 'single_choice',
        title: 'Single-choice practice',
      };
      req.reply({
        body: saved
          ? [
              choice,
              {
                id,
                versionId: saved.versionId,
                version: saved.version,
                title: saved.title,
                type: saved.type,
              },
            ]
          : [choice],
      });
    });
    cy.intercept('GET', `**/api/tasks/${id}`, (req) => {
      req.reply(saved ? { body: saved } : { statusCode: 404 });
    });
    cy.intercept('POST', '**/api/tasks', (req) => {
      expect(req.body).to.deep.equal(content);
      if (failCreate) {
        failCreate = false;
        req.reply({ statusCode: 503 });
        return;
      }
      saved = { ...content, id, versionId: versionIds[0], version: 1 };
      req.reply({ statusCode: 201, body: saved });
    }).as('createBlanks');
    cy.intercept('PUT', `**/api/tasks/${id}`, (req) => {
      const updated = { ...content, blanks: [['walked', 'went', 'ran'], ['cooked']] };
      expect(req.body).to.deep.equal({ ...updated, expectedVersion: 1 });
      saved = { ...updated, id, versionId: versionIds[1], version: 2 };
      req.reply({ body: saved });
    }).as('editBlanks');
  });

  for (const width of [1440, 402]) {
    it(`validates, previews, saves and edits a fill-blanks task at ${width}px`, () => {
      cy.viewport(width, width === 402 ? 874 : 1000);
      cy.visit('/tutor/tasks');
      cy.contains('a', /^Create task$/).click();
      cy.contains('a', /^Fill in the blanks$/).click();
      cy.contains('h1', 'Fill blanks editor').should('be.visible');

      cy.get('#task-title').type(content.title);
      cy.get('#task-prompt').type(content.prompt);
      cy.get('#task-passage').type('Start at [2].');
      cy.contains('button', /^Save task$/).click();
      cy.get('#task-passage-error').should('be.visible').and('contain', 'starting with [1]');
      cy.get('#task-passage').clear().type(content.passage);
      cy.contains('Required inputs: 2').should('be.visible');
      cy.contains('button', /^Save task$/).click();
      cy.get('#blank-1-error').should('be.visible');
      cy.get('#blank-2-error').should('be.visible');
      cy.get('@createBlanks.all').should('have.length', 0);

      cy.get('[aria-label="Blank 1 answer 1"]').type('walked');
      cy.get('[aria-label="Add answer for blank 1"]').click();
      cy.get('[aria-label="Blank 1 answer 2"]').type('went');
      cy.get('[aria-label="Blank 2 answer 1"]').type('cooked');
      cy.screenshot(`fill-blanks-editor-${width}`, { capture: 'fullPage' });
      cy.contains('button', 'Preview as student').click();
      cy.get('[aria-labelledby="blanks-preview"]').within(() => {
        cy.contains(content.prompt).should('be.visible');
        cy.get('input')
          .should('have.length', 2)
          .each(($input) => expect($input).to.have.value(''));
        cy.contains('walked').should('not.exist');
      });
      cy.document().then((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(width));
      cy.contains('button', 'Back to editor').click();

      cy.contains('button', /^Save task$/).click();
      cy.wait('@createBlanks').its('response.statusCode').should('eq', 503);
      cy.get('[aria-label="Blank 1 answer 2"]').should('have.value', 'went');
      cy.contains('button', /^Save task$/).click();
      cy.wait('@createBlanks').its('response.statusCode').should('eq', 201);
      cy.location('pathname').should('eq', '/tutor/tasks');
      cy.get('#task-format').select('Fill in the blanks');
      cy.contains('h3', 'Single-choice practice').should('not.exist');
      cy.contains('Fill in the blanks · Task v1').should('be.visible');

      cy.get('[aria-label="Edit task: Past tense practice"]').click();
      cy.get('#task-passage').should('have.value', content.passage);
      cy.get('[aria-label="Blank 1 answer 2"]').should('have.value', 'went');
      cy.get('[aria-label="Add answer for blank 1"]').click();
      cy.get('[aria-label="Blank 1 answer 3"]').type('ran');
      cy.contains('button', /^Save task$/).click();
      cy.wait('@editBlanks');
      cy.contains('Task saved.').should('be.visible');
      cy.reload();
      cy.get('[aria-label="Blank 1 answer 3"]').should('have.value', 'ran');
    });
  }
});
