describe('Workspace setup', () => {
  it('connects the browser client to the running backend', () => {
    cy.intercept('GET', 'http://localhost:3001/api/health').as('health');
    cy.visit('/');
    cy.contains('h1', 'Online lessons').should('be.visible');
    cy.wait('@health').its('response.statusCode').should('eq', 200);
    cy.contains('Backend connected').should('be.visible');
  });
});
