/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Cypress front-end integration tests - simple report submission.                 C.Veness 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import dateFormat from 'dateformat'; // Steven Levithan's dateFormat()

/* global Cypress, cy */


describe('Submit test-grn/sexual-assault incident report', function () {
    const report = 'http://report.thewhistle.local:3000';
    const admin = 'http://admin.thewhistle.local:3000';

    const date = dateFormat('d mmm yyyy HH:MM');
    let alias = null;

    it('loads home page', function() {

        cy.visit(report+'/test-grn/sexual-assault');
        cy.contains('Get started').click();

        cy.url().should('include', '/test-grn/sexual-assault/1'); // alias
        cy.get('output[name=generated-alias]').then(($alias) => {
            alias = $alias.text();
        });
        cy.contains('Submit and continue').click();

        cy.url().should('include', '/test-grn/sexual-assault/2'); // on-behalf-of
        cy.get('#on-behalf-of-myself + label').contains('Myself').click();
        cy.contains('Submit and continue').click();

        cy.url().should('include', '/test-grn/sexual-assault/3'); // when / still-happening
        cy.get('#when label').contains('Yes, exactly when it happened').click();
        cy.get('#still-happening label').contains('Yes').click();
        cy.contains('Submit and continue').click();

        cy.url().should('include', '/test-grn/sexual-assault/4'); // where
        // cy.get('#where label').contains('Location').click();
        cy.get('textarea[name=at-address]').type('University of Lagos');
        cy.contains('Submit and continue').click();

        cy.url().should('include', '/test-grn/sexual-assault/5'); // who
        cy.get('input.who-relationship').should('not.be.visible');
        cy.get('textarea.who-description').should('not.be.visible');
        cy.get('#who label').contains('No').click();
        cy.get('input.who-relationship').should('not.be.visible');
        // cy.get('textarea.who-description').should('be.visible'); // TODO why does this fail?
        cy.get('#who-description').type('Big fat guy');
        cy.contains('Submit and continue').click();

        cy.url().should('include', '/test-grn/sexual-assault/6'); // description
        cy.get('textarea[name=description]').type('Cypress test '+date);
        cy.get('label').contains('Female').click();
        cy.get('select').select('20–24');
        cy.contains('Submit and continue').click();

        cy.url().should('include', '/test-grn/sexual-assault/7'); // action-taken
        cy.contains('Teacher/tutor/lecturer').click();
        cy.get('input[name=action-taken-teacher-details]').type('Miss Brodie');
        cy.contains('Friends, family').click();
        cy.contains('Submit and continue').click();

        cy.url().should('include', '/test-grn/sexual-assault/8'); // extra-notes
        cy.get('textarea').type('Nothing more');
        cy.contains('Submit and continue to Resources').click();
    });

    it('sees & deletes report in admin', function() {
        const testuser = Cypress.env('TESTUSER');
        const testpass = Cypress.env('TESTPASS');

        cy.visit(admin+'/login');
        cy.get('input[name=username]').type(testuser);
        cy.get('input[name=password]').type(testpass);
        cy.get('form').contains('Login').click();
        cy.url().should('include', '/reports');
        cy.contains('Cypress test '+date).click();

        // cy.url().should('include', '/reports/'+id);
        cy.get('table.js-obj-to-html td').contains(alias);
        cy.get('button[name=delete]').click();
        cy.url().should('include', '/reports');

        cy.get('nav').contains('Logout').click();
    });
});
