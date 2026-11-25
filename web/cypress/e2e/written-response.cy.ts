describe('US06 written-response authoring', () => {
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
    '04fb763b-9ba5-490c-ac69-b089597e6b6a',
  ];
  const content = {
    type: 'written_response',
    title: 'Weekend reflection',
    prompt: 'What did you do last weekend?',
  };
  const updated = { ...content, prompt: 'Describe your last holiday.' };
  let failCreate: boolean;
  let saved: (typeof content & { id: string; versionId: string; version: number }) | undefined;

  beforeEach(() => {
    failCreate = true;
    saved = undefined;
    cy.intercept('GET', '**/api/auth/me', { body: { user: tutor } });
    cy.intercept('GET', '**/api/tasks', (req) => {
      const existing = {
        id: '4b8dc2fc-d0a8-491b-86e7-38e75980f46f',
        versionId: versionIds[0],
        version: 1,
        type: 'fill_blanks',
        title: 'Past tense practice',
      };
      const summary = saved && {
        id,
        versionId: saved.versionId,
        version: saved.version,
        title: saved.title,
        type: saved.type,
      };
      req.reply({ body: summary ? [existing, summary] : [existing] });
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
    }).as('createWritten');
    cy.intercept('PUT', `**/api/tasks/${id}`, (req) => {
      expect(req.body).to.deep.equal({ ...updated, expectedVersion: 1 });
      saved = { ...updated, id, versionId: versionIds[1], version: 2 };
      req.reply({ body: saved });
    }).as('editWritten');
  });

  for (const width of [1440, 402]) {
    it(`validates, previews and versions a written task at ${width}px`, () => {
      cy.viewport(width, width === 402 ? 874 : 1000);
      cy.visit('/tutor/tasks');
      cy.contains('a', /^Create task$/).click();
      cy.contains('a', /^Written response$/).click();
      cy.contains('h1', 'Written response editor').should('be.visible');
      cy.contains('h2', 'Manual review').should('be.visible');
      cy.contains('Required inputs: 1').should('be.visible');

      cy.contains('button', /^Save task$/).click();
      cy.get('#task-title-error').should('be.visible');
      cy.get('#task-prompt-error').should('be.visible');
      cy.get('#task-title').type(content.title);
      cy.get('#task-prompt').type(content.prompt);
      cy.screenshot(`written-response-editor-${width}`, { capture: 'fullPage' });
      cy.contains('button', 'Preview as student').click();
      cy.get('[aria-labelledby="written-preview"]').within(() => {
        cy.contains(content.prompt).should('be.visible');
        cy.get('textarea')
          .should('have.length', 1)
          .and('have.value', '')
          .type('First line.{enter}Second line.');
      });
      cy.document().then((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(width));
      cy.get('@createWritten.all').should('have.length', 0);
      cy.contains('button', 'Back to editor').click();

      cy.contains('button', /^Save task$/).click();
      cy.wait('@createWritten').its('response.statusCode').should('eq', 503);
      cy.get('#task-prompt').should('have.value', content.prompt);
      cy.contains('button', /^Save task$/).click();
      cy.wait('@createWritten').its('response.statusCode').should('eq', 201);
      cy.location('pathname').should('eq', '/tutor/tasks');
      cy.get('#task-format').select('Written response');
      cy.contains('Past tense practice').should('not.exist');
      cy.contains('Written response · Task v1').should('be.visible');

      cy.get('[aria-label="Edit task: Weekend reflection"]').click();
      cy.get('#task-prompt').should('have.value', content.prompt).clear().type(updated.prompt);
      cy.contains('button', /^Save task$/).click();
      cy.wait('@editWritten');
      cy.contains('Task saved.').should('be.visible');
      cy.reload();
      cy.get('#task-prompt').should('have.value', updated.prompt);
      cy.contains('Task library · Task v2').should('be.visible');
    });
  }
});
