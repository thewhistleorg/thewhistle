/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Cypress front-end integration tests - long description.                         C.Veness 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

/* global Cypress, cy */
/* eslint no-unreachable: off */

const org = 'grn-test';         // the test organisation for the live ‘grn‘ organisation
const proj = 'rape-is-a-crime'; // GRN's only project

const lorum = `
Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore \
et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut \
aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse \
cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in \
culpa qui officia deserunt mollit anim id est laborum. `;

const description = lorum.repeat(12).slice(0, 5000); // description of 5k chars is beyond cookie 4k limit

describe(`Submit ${org}/${proj} incident report with long description`, function () {

    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
    return; /* suspend this test from normal CI as it is so slow: can be manually run if required */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

    this.slow(100e3); // 100 sec

    Cypress.config('defaultCommandTimeout', 90e3);
    Cypress.config('pageLoadTimeout', 90e3);

    const report = 'http://report.thewhistle.local:3000';
    const admin = 'http://admin.thewhistle.local:3000';

    let alias = null;
    it('submits report with long description', function() {

        cy.visit(`${report}/${org}/${proj}`);
        cy.contains('Get started').click();

        cy.url().should('include', `/${org}/${proj}/1`); // alias
        cy.wait(200); // wait for ajax alias to be returned TODO: include alias in returned page, not using ajax
        cy.get('output[name=generated-alias]').then(($alias) => {
            alias = $alias.text();
        });
        cy.contains('Submit and continue').click();

        cy.url().should('include', `/${org}/${proj}/2`); // on-behalf-of / survivor-gender/age
        cy.contains('Submit and continue').click();

        cy.url().should('include', `/${org}/${proj}/3`); // when / still-happening
        cy.contains('Submit and continue').click();

        cy.url().should('include', `/${org}/${proj}/4`); // where
        cy.contains('Submit and continue').click();

        cy.url().should('include', `/${org}/${proj}/5`); // who
        cy.contains('Submit and continue').click();

        cy.url().should('include', `/${org}/${proj}/6`); // description
        cy.get('textarea[name=description]').type(description);    // !! TAKES AROUND 1 MIN TO TYPE!
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        cy.get('textarea[name=description]').contains(lorum); // no need to bother with entire desc!
    });


    it('sees & deletes report in admin', function() {
        const testuser = Cypress.env('TESTUSER');
        const testpass = Cypress.env('TESTPASS');

        cy.visit(admin+'/login');
        cy.get('input[name=username]').type(testuser);
        cy.get('input[name=password]').type(testpass);
        cy.get('form').contains('Login').click();
        cy.url().should('include', '/reports');
        cy.contains(alias).click();

        cy.get('table.js-obj-to-html td').contains(alias);
        cy.get('button[name=delete]').click();
        cy.url().should('include', '/reports');

        cy.get('nav').contains('Logout').click();
    });

});
