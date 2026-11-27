export function stubEmptySchedule() {
  cy.intercept('GET', '**/api/sessions', {
    body: { serverNow: '2026-11-27T12:00:00.000Z', sessions: [] },
  });
}
