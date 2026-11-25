describe('US03 tutor invitations', () => {
  const token = 'a'.repeat(64);
  const tutor = {
    id: 'tutor',
    name: 'Elena',
    lastname: 'Martin',
    email: 'elena@example.test',
    role: 'TUTOR',
  };
  const student = {
    id: 'student',
    name: 'Alex',
    lastname: 'Rivera',
    email: 'alex@example.test',
    role: 'STUDENT',
  };
  const invitation = { id: 'invitation', expiresAt: '2026-12-01T12:00:00.000Z', status: 'pending' };
  let current: typeof tutor | null;
  let connected: boolean;
  let invites: (typeof invitation)[];
  const link = () => ({
    id: 'connection',
    linkedAt: '2026-11-24T12:00:00Z',
    person: current?.role === 'TUTOR' ? student : tutor,
  });

  beforeEach(() => {
    current = null;
    connected = false;
    invites = [];
    cy.intercept('GET', '**/api/auth/me', (req) =>
      req.reply(current ? { body: { user: current } } : { statusCode: 401 })
    );
    cy.intercept('GET', '**/api/connections', (req) =>
      req.reply({ body: connected ? [link()] : [] })
    );
    cy.intercept('GET', '**/api/connections/invitations', (req) => req.reply({ body: invites }));
    cy.intercept('POST', '**/api/connections/invitations', (req) => {
      invites = [invitation];
      req.reply({ statusCode: 201, body: { ...invitation, token } });
    });
    cy.intercept('POST', '**/api/connections/invitations/preview', (req) => {
      expect(req.body).to.deep.equal({ token });
      req.reply({ body: { tutor, expiresAt: invitation.expiresAt, accepted: connected } });
    }).as('preview');
    cy.intercept('POST', '**/api/connections/invitations/accept', (req) => {
      expect(req.body).to.deep.equal({ token });
      connected = true;
      req.reply({ body: link() });
    }).as('accept');
  });

  for (const width of [1440, 402]) {
    it(`creates, copies and revokes an invitation at ${width}px`, () => {
      cy.viewport(width, width === 402 ? 874 : 1000);
      current = tutor;
      cy.visit('/tutor');
      cy.contains('a', 'Manage students').click();
      cy.location('pathname').should('eq', '/tutor/students');
      cy.contains('button', 'Create invitation link').click();
      cy.location('origin').then((origin) => {
        cy.get('#invitation-link').should('have.value', `${origin}/invite?token=${token}`);
      });
      cy.window().then((win) =>
        cy.stub(win.navigator.clipboard, 'writeText').resolves().as('copy')
      );
      cy.contains('button', 'Copy invitation link').click();
      cy.get('@copy').should('have.been.calledOnce');
      cy.contains('Invitation link copied.').should('be.visible');
      cy.screenshot(`students-${width}`, { capture: 'viewport' });
      cy.document().then((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(width));
      cy.intercept('DELETE', '**/api/connections/invitations/invitation', (req) => {
        invites = [{ ...invitation, status: 'revoked' }];
        req.reply({ statusCode: 204 });
      });
      cy.contains('button', 'Revoke').click();
      cy.contains('Invitation revoked.').should('be.visible');
      cy.get('#invitation-link').should('not.exist');
    });

    it(`returns from login to confirmation and connects at ${width}px`, () => {
      cy.viewport(width, width === 402 ? 874 : 1000);
      cy.intercept('POST', '**/api/auth/login', (req) => {
        current = student;
        req.reply({ body: { user: student } });
      });
      cy.visit(`/invite?token=${token}`);
      cy.contains('a', /^Sign in$/).click();
      cy.location('search').should('include', `invitation=${token}`);
      cy.get('#email').type(student.email);
      cy.get('#password').type('abcde');
      cy.contains('button', /^Sign in$/).click();
      cy.location('pathname').should('eq', '/invite');
      cy.wait('@preview');
      cy.contains('Elena Martin').should('be.visible');
      cy.get('@accept.all').should('have.length', 0);
      cy.screenshot(`invitation-${width}`, { capture: 'viewport' });
      cy.document().then((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(width));
      cy.contains('button', 'Accept invitation').click();
      cy.wait('@accept');
      cy.contains('You are connected to Elena Martin.').should('be.visible');
      cy.contains('a', 'Go to dashboard').click();
      cy.location('pathname').should('eq', '/student');
      cy.contains('h2', 'Your tutor').should('be.visible');
      cy.contains('Elena Martin').should('be.visible');
    });
  }

  it('preserves invitation through registration with Student preselected', () => {
    cy.viewport(402, 874);
    cy.intercept('POST', '**/api/auth/register', (req) => {
      expect(req.body.role).to.eq('STUDENT');
      current = student;
      req.reply({ statusCode: 201, body: { user: student } });
    });
    cy.visit(`/invite?token=${token}`);
    cy.contains('a', 'Create student account').click();
    cy.get('#role').should('have.value', 'STUDENT');
    cy.get('#name').type('Alex');
    cy.get('#lastname').type('Rivera');
    cy.get('#email').type(student.email);
    cy.get('#password').type('abcde');
    cy.get('#confirmation').type('abcde');
    cy.contains('button', /^Create account$/).click();
    cy.location('pathname').should('eq', '/invite');
    cy.contains('button', 'Accept invitation').should('be.visible');
  });

  it('shows invalid invitations and conflicts without false success', () => {
    current = student;
    cy.intercept('POST', '**/api/connections/invitations/preview', { statusCode: 404 });
    cy.visit(`/invite?token=${token}`);
    cy.get('[role="alert"]').should('contain', 'invalid, expired, revoked or already used');
    cy.contains('button', 'Accept invitation').should('not.exist');
    cy.intercept('POST', '**/api/connections/invitations/preview', {
      body: { tutor, expiresAt: invitation.expiresAt, accepted: false },
    });
    cy.intercept('POST', '**/api/connections/invitations/accept', { statusCode: 409 });
    cy.reload();
    cy.contains('button', 'Accept invitation').click();
    cy.get('[role="alert"]').should('contain', 'already connected to another tutor');
    cy.contains('a', 'Go to dashboard').should('not.exist');
  });

  it('shows an accepted invitation as unavailable after the relationship ends', () => {
    current = student;
    connected = true;
    cy.visit(`/invite?token=${token}`);
    cy.contains('You are connected to Elena Martin.').should('be.visible');

    cy.intercept('POST', '**/api/connections/invitations/preview', { statusCode: 404 });
    cy.reload();
    cy.get('[role="alert"]').should('contain', 'Ask your tutor for a new link.');
    cy.contains('You are connected to Elena Martin.').should('not.exist');
    cy.contains('button', 'Accept invitation').should('not.exist');
  });
});
