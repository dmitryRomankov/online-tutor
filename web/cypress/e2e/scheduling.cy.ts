describe('US09 lesson scheduling', () => {
  const id = '0068b22e-6691-4a2f-9c19-b396b4be2166';
  const lessonId = 'f9ce7338-4cd0-4087-854f-8d5d15799a3d';
  const connectionId = '4244c58b-a1b7-43dc-865d-c58a54f6f244';
  const start = '2099-11-27T14:00:00.000Z';
  const booking = {
    id,
    lessonId,
    scheduledStart: start,
    durationMinutes: 45,
    title: 'Past simple',
    participantName: 'Alex Rivera',
    state: 'scheduled',
    canJoin: false,
    canPrepare: true,
  };
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

  for (const width of [1440, 402]) {
    it(`schedules and retries safely from the tutor dashboard at ${width}px`, () => {
      cy.viewport(width, width === 402 ? 874 : 1000);
      cy.intercept('GET', '**/api/auth/me', { body: { user: tutor } });
      cy.intercept('GET', '**/api/connections', {
        body: [{ id: connectionId, person: student, linkedAt: start }],
      });
      cy.intercept('GET', '**/api/lessons', {
        body: [{ id: lessonId, title: booking.title, versionId: id, version: 1 }],
      });
      let bookingId: string | undefined;
      let confirmed: typeof booking | undefined;
      const expectedStart = new Date(2099, 10, 27, 14).toISOString();
      cy.intercept('GET', '**/api/sessions', (req) =>
        req.reply({
          body: { serverNow: start, sessions: confirmed ? [confirmed] : [] },
        })
      );
      cy.intercept('GET', '**/api/sessions/*', (req) => req.reply({ body: confirmed }));
      cy.intercept('POST', '**/api/sessions', (req) => {
        expect(req.body).to.deep.include({
          connectionId,
          lessonId,
          durationMinutes: 45,
          scheduledStart: expectedStart,
        });
        if (!bookingId) {
          bookingId = req.body.id;
          req.reply({
            statusCode: 503,
            body: { message: 'Scheduling is temporarily unavailable.' },
          });
          return;
        }
        expect(req.body.id).to.equal(bookingId);
        confirmed = { ...booking, id: bookingId, scheduledStart: req.body.scheduledStart };
        req.reply({ statusCode: 201, body: confirmed });
      }).as('createBooking');
      cy.visit('/tutor');
      cy.contains('a', 'Schedule lesson').click();
      cy.get('#booking-student').select(connectionId);
      cy.get('#booking-lesson').select(lessonId);
      cy.contains('button', 'Create scheduled lesson').click();
      cy.get('#booking-date-error').should('be.visible');
      cy.get('#booking-date').type('2099-11-27');
      cy.get('#booking-time').type('14:00');
      cy.document().then((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(width));
      cy.screenshot(`schedule-form-${width}`, { capture: 'fullPage' });
      cy.contains('button', 'Create scheduled lesson').click();
      cy.wait('@createBooking').its('response.statusCode').should('eq', 503);
      cy.get('#booking-time').should('have.value', '14:00');
      cy.contains('button', 'Create scheduled lesson').click();
      cy.wait('@createBooking').its('response.statusCode').should('eq', 201);
      cy.contains('Booking confirmed').should('be.visible');
      cy.get('time').should('have.attr', 'datetime', expectedStart);
      cy.contains('a', 'Prepare classroom')
        .should('have.attr', 'href')
        .and('not.include', '/booking');
      cy.contains('a', 'Back to dashboard').click();
      cy.contains('Past simple').should('be.visible');
      cy.contains('a', 'View booking').should('be.visible');
      cy.screenshot(`tutor-booking-${width}`, { capture: 'fullPage' });
    });

    it(`blocks direct early entry and enables Join at the start at ${width}px`, () => {
      cy.viewport(width, width === 402 ? 874 : 1000);
      cy.intercept('GET', '**/api/auth/me', { body: { user: student } });
      cy.intercept('GET', '**/api/connections', {
        body: [{ id: connectionId, person: tutor, linkedAt: start }],
      });
      const studentBooking = { ...booking, participantName: 'Elena Martin' };
      let eligible = false;
      cy.intercept('GET', `**/api/sessions/${id}/entry`, (req) =>
        req.reply(
          eligible
            ? {
                body: { ...studentBooking, canJoin: true },
              }
            : {
                statusCode: 409,
                body: { message: 'Join opens at the scheduled start.' },
              }
        )
      );
      let lists = 0;
      cy.intercept('GET', '**/api/sessions', (req) => {
        eligible = ++lists > 1;
        req.reply({
          body: {
            serverNow: eligible ? start : '2099-11-27T13:59:58.000Z',
            sessions: [{ ...studentBooking, canJoin: eligible }],
          },
        });
      }).as('schedule');
      cy.visit(`/student/sessions/${id}`);
      cy.contains('Join opens at the scheduled start.').should('be.visible');
      cy.contains('a', 'Back to dashboard').click();
      cy.wait('@schedule');
      cy.contains('button', /^Join$/).should('be.disabled');
      cy.screenshot(`student-booking-${width}`, { capture: 'fullPage' });
      cy.contains('a', /^Join$/, { timeout: 6000 }).click();
      cy.contains('Waiting for your tutor').should('be.visible');
      cy.contains('Elena Martin').should('be.visible');
      cy.document().then((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(width));
      cy.screenshot(`student-session-${width}`, { capture: 'fullPage' });
    });
  }
});
