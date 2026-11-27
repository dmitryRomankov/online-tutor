describe('US13 classroom lifecycle', () => {
  const id = '0068b22e-6691-4a2f-9c19-b396b4be2166';
  const lessonId = 'f9ce7338-4cd0-4087-854f-8d5d15799a3d';
  const version = { id: lessonId, title: 'Past simple practice', number: 2, activityCount: 3 };
  const start = '2025-11-27T14:00:00.000Z';
  const tutor = {
    id: 'tutor',
    name: 'Elena',
    lastname: 'Martin',
    email: 'tutor@example.test',
    role: 'TUTOR',
  };
  const student = {
    id: 'student',
    name: 'Alex',
    lastname: 'Rivera',
    email: 'student@example.test',
    role: 'STUDENT',
  };
  const booking = {
    id,
    lessonId,
    title: version.title,
    participantName: 'Elena Martin',
    scheduledStart: start,
    durationMinutes: 45,
    state: 'scheduled',
    canJoin: true,
    canPrepare: true,
  };
  const endpoint = `**/api/sessions/${id}`;

  for (const width of [1440, 402]) {
    it(`prepares, starts and confirms End as the tutor at ${width}px`, () => {
      cy.viewport(width, width === 402 ? 874 : 1000);
      cy.intercept('GET', '**/api/auth/me', { body: { user: tutor } });
      cy.intercept('GET', endpoint, {
        body: { ...booking, participantName: 'Alex Rivera', canJoin: false },
      });
      let state = 'scheduled';
      cy.intercept('GET', `${endpoint}/content-version`, (req) =>
        req.reply({ body: { id, state, version } })
      );
      cy.intercept('POST', `${endpoint}/start`, (req) => {
        state = 'active';
        req.reply({ body: { id, state, version } });
      }).as('start');
      let attempts = 0;
      cy.intercept('POST', `${endpoint}/end`, (req) => {
        if (++attempts === 1) {
          req.reply({ statusCode: 503 });
          return;
        }
        state = 'ended';
        req.reply({ body: { id, state, version } });
      }).as('end');

      cy.visit(`/tutor/sessions/${id}/booking`);
      cy.contains('a', 'Prepare classroom').click();
      cy.contains('h1', 'Classroom preparation').should('be.visible');
      cy.contains('button', /^Start lesson$/).click();
      cy.wait('@start');
      cy.contains('h1', 'Active classroom').should('be.visible');
      cy.contains('Locked lesson v2').should('be.visible');
      cy.screenshot(`active-tutor-${width}`, { capture: 'fullPage' });
      cy.contains('button', /^End lesson$/).click();
      cy.contains('End this lesson?').should('be.visible');
      cy.contains('Changes that are still saving may be lost.').should('be.visible');
      cy.document().then((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(width));
      cy.screenshot(`end-confirmation-${width}`, { capture: 'fullPage' });
      cy.contains('button', 'Keep teaching').click();
      cy.contains('h1', 'Active classroom').should('be.visible');
      cy.then(() => expect(attempts).to.eq(0));

      cy.contains('button', /^End lesson$/).click();
      cy.contains('button', /^End lesson$/).click();
      cy.wait('@end').its('response.statusCode').should('eq', 503);
      cy.contains('temporarily unavailable').should('be.visible');
      cy.contains('button', /^End lesson$/).click();
      cy.wait('@end').its('response.statusCode').should('eq', 200);
      cy.contains('h1', 'Session record').should('be.visible');
      cy.contains('Completed session content is read-only.').should('be.visible');
      cy.get('button')
        .contains(/^End lesson$/)
        .should('not.exist');
    });

    it(`moves the student from waiting to active and ended without reloading at ${width}px`, () => {
      cy.viewport(width, width === 402 ? 874 : 1000);
      cy.intercept('GET', '**/api/auth/me', { body: { user: student } });
      let state = 'scheduled';
      cy.intercept('GET', `${endpoint}/entry`, (req) => {
        if (state === 'ended') {
          req.reply({
            statusCode: 409,
            body: { code: 'schedule_closed', message: 'This session is closed for entry.' },
          });
        } else {
          req.reply({ body: { ...booking, state } });
        }
      });
      cy.intercept('GET', endpoint, (req) =>
        req.reply({ body: { ...booking, state, canJoin: false, canPrepare: false } })
      );

      cy.visit(`/student/sessions/${id}`);
      cy.contains('h1', 'Waiting room').should('be.visible');
      cy.contains('Waiting for your tutor').should('be.visible');
      cy.screenshot(`student-waiting-${width}`, { capture: 'fullPage' });
      cy.then(() => {
        state = 'active';
      });
      cy.contains('h1', 'Active classroom', { timeout: 7000 }).should('be.visible');
      cy.contains('Your tutor is choosing an activity').should('be.visible');
      cy.document().then((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(width));
      cy.screenshot(`active-student-${width}`, { capture: 'fullPage' });
      cy.then(() => {
        state = 'ended';
      });
      cy.contains('h1', 'Session record', { timeout: 7000 }).should('be.visible');
      cy.contains('Lesson ended').should('be.visible');
      cy.contains('Confirmed work is preserved.').should('be.visible');
    });
  }
});
