describe('US01 / US02 frontend', () => {
  let current: { id: string; email: string; name: string; lastname: string; role: string } | null;
  const student = {
    id: 'student-fixture',
    email: 'alex!rivera@example.test',
    name: 'Alex',
    lastname: 'Rivera',
    role: 'STUDENT',
  };
  const password = 'abcde';

  beforeEach(() => {
    current = null;
    cy.intercept('GET', '**/api/connections', { body: [] });
    cy.intercept('GET', '**/api/auth/me', (request) => {
      request.reply(current ? { statusCode: 200, body: { user: current } } : { statusCode: 401 });
    }).as('identity');
  });

  it('keeps the mobile auth menu sized and keyboard operable', () => {
    cy.viewport(402, 874);
    cy.visit('/sign-in');
    cy.contains('button', /^Menu$/).should('have.css', 'min-width', '80px');
    cy.contains('button', /^Menu$/).should('have.css', 'min-height', '44px');
    cy.contains('button', /^Menu$/).focus();
    cy.press(Cypress.Keyboard.Keys.ENTER);
    cy.contains('[role="menuitem"]', 'Sign in').should('have.focus');
    cy.press(Cypress.Keyboard.Keys.DOWN);
    cy.contains('[role="menuitem"]', 'Create account').should('have.focus');
    cy.press(Cypress.Keyboard.Keys.ESC);
    cy.get('[role="menu"]').should('not.exist');
    cy.contains('button', /^Menu$/).should('have.focus');
  });

  it('registers a tutor at phone size and signs out from the account menu', () => {
    cy.viewport(402, 874);
    cy.intercept('POST', '**/api/auth/register', (request) => {
      expect(request.body).to.deep.equal({
        name: 'Alex',
        lastname: 'Rivera',
        email: 'new.tutor@example.test',
        password,
        role: 'TUTOR',
      });
      current = {
        id: 'tutor-fixture',
        email: 'new.tutor@example.test',
        name: 'Alex',
        lastname: 'Rivera',
        role: 'TUTOR',
      };
      request.reply({ statusCode: 201, body: { user: current } });
    });
    cy.intercept('POST', '**/api/auth/logout', (request) => {
      current = null;
      request.reply({ statusCode: 204 });
    });
    cy.visit('/register');
    cy.get('#name').type('Alex');
    cy.get('#lastname').type('Rivera');
    cy.get('#email').should('be.visible');
    cy.screenshot('registration-phone', { capture: 'viewport' });
    cy.get('#email').type('new.tutor@example.test');
    cy.get('#password').type(password);
    cy.get('#confirmation').type(password);
    cy.get('#role').select('TUTOR');
    cy.contains('button', 'Create account').click();
    cy.location('pathname').should('eq', '/tutor');
    cy.contains('Your account is ready').should('be.visible');
    cy.get('[aria-label="Account menu"]').click();
    cy.contains('[role="menuitem"]', 'Sign out').click();
    cy.location('pathname').should('eq', '/sign-in');
    cy.contains('You have been signed out.').should('be.visible');
  });

  it('signs in an existing student with email punctuation and restores identity after reload', () => {
    cy.viewport(1440, 900);
    cy.intercept('POST', '**/api/auth/login', (request) => {
      expect(request.body).to.deep.equal({ email: student.email, password });
      current = student;
      request.reply({ statusCode: 200, body: { user: current } });
    });
    cy.visit('/sign-in');
    cy.get('#email').should('be.visible');
    cy.screenshot('sign-in-desktop', { capture: 'viewport' });
    cy.get('#email').type(student.email);
    cy.get('#password').type(password);
    cy.contains('button', /^Sign in$/).click();
    cy.location('pathname').should('eq', '/student');
    cy.reload();
    cy.contains('Your account is ready').should('be.visible');
    cy.location('pathname').should('eq', '/student');
  });

  it('shows duplicate email without losing entered fields', () => {
    cy.intercept('POST', '**/api/auth/register', { statusCode: 409 });
    cy.visit('/register');
    cy.get('#name').type('Alex');
    cy.get('#lastname').type('Rivera');
    cy.get('#email').type(student.email);
    cy.get('#password').type(password);
    cy.get('#confirmation').type(password);
    cy.contains('button', 'Create account').click();
    cy.contains('An account with this email already exists.').should('be.visible');
    cy.get('#email').should('have.value', student.email).and('have.focus');
    cy.location('pathname').should('eq', '/register');
  });

  it('renders validation and network failure with a usable retry', () => {
    cy.intercept('POST', '**/api/auth/login', { forceNetworkError: true });
    cy.visit('/sign-in');
    cy.contains('button', /^Sign in$/).click();
    cy.contains('Enter your email.').should('be.visible');
    cy.get('#email').type(student.email);
    cy.get('#password').type(password);
    cy.contains('button', /^Sign in$/).click();
    cy.contains('Could not connect.').should('be.visible');
    cy.contains('button', /^Sign in$/).should('be.enabled');
  });

  it('handles an ended session on a protected destination', () => {
    current = student;
    cy.visit('/student');
    cy.contains('Your account is ready').should('be.visible');
    cy.then(() => {
      current = null;
    });
    cy.reload();
    cy.location('pathname').should('eq', '/sign-in');
    cy.contains('Your account is ready').should('not.exist');
  });

  it('routes an existing user to their actual profile', () => {
    current = student;
    cy.visit('/tutor');
    cy.location('pathname').should('eq', '/student');
    cy.contains('Your account is ready').should('be.visible');
  });

  it('keeps sign-out failure visible instead of claiming success', () => {
    cy.viewport(1440, 900);
    current = student;
    cy.intercept('POST', '**/api/auth/logout', { statusCode: 503 });
    cy.visit('/student');
    cy.get('.account-sidebar').contains('button', 'Sign out').click();
    cy.contains('Could not sign out').should('be.visible');
    cy.location('pathname').should('eq', '/student');
  });
});

for (const [width, height] of [
  [1440, 900],
  [402, 874],
]) {
  it(`keeps registration errors inline and the profile warning amber at ${width}px`, () => {
    cy.viewport(width, height);
    cy.intercept('GET', '**/api/auth/me', { statusCode: 401 });
    cy.visit('/register');
    cy.contains('button', 'Create account').click();
    for (const field of ['name', 'lastname', 'email', 'password']) {
      cy.get(`#${field}-error`).should('have.css', 'color', 'rgb(180, 35, 24)');
      cy.get(`#${field}`).then(($control) => {
        cy.get(`#${field}-error`).then(($error) => {
          expect($error[0].getBoundingClientRect().top).to.be.at.least(
            $control[0].getBoundingClientRect().bottom
          );
        });
      });
    }
    cy.get('.profile-help:visible')
      .should('have.css', 'color', 'rgb(146, 64, 14)')
      .and('have.css', 'background-color', 'rgb(255, 244, 214)');
    cy.screenshot(`registration-errors-${width}`, { capture: 'fullPage' });
  });
}
