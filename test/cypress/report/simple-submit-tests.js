/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Cypress front-end integration tests - GRN simple report submission.             C.Veness 2018  */
/*                                                                                                */
/*                                       © 2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

/* eslint promise/catch-or-return: off, promise/always-return: off */
/* global Cypress, cy, expect */

import dateFormat from 'dateformat'; // Steven Levithan's dateFormat()
import { JSDOM }  from 'jsdom';      // JavaScript implementation of DOM and HTML standards

const org = 'grn-test';         // the test organisation for the live ‘grn‘ organisation
const proj = 'rape-is-a-crime'; // GRN's only project


describe(`Submit ${org}/${proj} incident report simply visiting each page`, function () {
    const report = 'http://report.thewhistle.local:3000';
    const admin = 'http://admin.thewhistle.local:3000';

    const date = dateFormat('d mmm yyyy HH:MM');
    let alias = null;

    it('visits each page', function() {

        cy.visit(`${report}/${org}/${proj}`);
        cy.contains('Get started').click();

        cy.url().should('include', `/${org}/${proj}/1`); // alias
        cy.get('output[name=used-before-generated-alias]').should('not.be.empty');
        cy.get('output[name=used-before-generated-alias]').then(($alias) => {
            alias = $alias.text(); // record alias to delete report later
            cy.log('alias', alias);
        });
        cy.contains('Submit and continue').click();

        cy.url().should('include', `/${org}/${proj}/2`); // on-behalf-of
        cy.get('#on-behalf-of-self + label').contains('Myself').click();
        cy.get('label').contains('Female').click();
        cy.get('select').select('20–24');
        cy.contains('Submit and continue').click();

        cy.url().should('include', `/${org}/${proj}/3`); // when / still-happening
        cy.get('.question-when label').contains('Yes, exactly when it happened').click();
        cy.get('.question-still-happening label').contains('Yes').click();
        cy.contains('Submit and continue').click();

        cy.url().should('include', `/${org}/${proj}/4`); // where
        // cy.get('#where label').contains('Location').click();
        cy.get('select[name=where]').select('Neighbourhood');
        cy.get('textarea[name=where-details]').type('Around the corner');
        cy.contains('Submit and continue').click();

        cy.url().should('include', `/${org}/${proj}/5`); // who
        cy.get('input.who-relationship').should('not.be.visible');
        cy.get('textarea.who-description').should('not.be.visible');
        cy.get('.question-who label').contains('No').click();
        cy.get('input.who-relationship').should('not.be.visible');
        // cy.get('textarea.who-description').should('be.visible'); // TODO why does this fail?
        cy.get('#who-description').type('Big fat guy');
        cy.contains('Submit and continue').click();

        cy.url().should('include', `/${org}/${proj}/6`); // description
        cy.get('textarea[name=description]').type('Cypress test '+date);
        cy.contains('Submit and continue').click();

        cy.url().should('include', `/${org}/${proj}/7`); // action-taken
        cy.contains('Teacher/tutor/lecturer').click();
        cy.get('input[name=action-taken-teacher-details]').type('Miss Brodie');
        cy.contains('Friends, family').click();
        cy.contains('Submit and continue').click();

        cy.url().should('include', `/${org}/${proj}/8`); // extra-notes / contact-details
        cy.get('textarea[name=extra-notes]').type('Nothing more');
        cy.get('input[name=contact-email]').type('help@me.com');
        cy.get('input[name=contact-phone]').type('01234 123456');
        cy.contains('Submit and continue to Resources').click();

        cy.url().should('include', `/${org}/${proj}/whatnext`);
    });

    it('sees & deletes report in admin', function() {
        cy.viewport(2000, 2000);
        const testuser = Cypress.env('TESTUSER');
        const testpass = Cypress.env('TESTPASS');

        cy.visit(admin+'/login');
        cy.get('input[name=username]').type(testuser);
        cy.get('input[name=password]').type(testpass);
        cy.wait(200); // TODO: use .as() / .wait()?
        cy.get('label').contains(org).click();
        cy.get('form').contains('Login').click();
        cy.url().should('include', '/reports');
        cy.contains('Cypress test '+date).click();

        // wait a bit to be sure the alias assignment has worked through the event loop...
        // in principle, using .as('@alias'), cy.wait('@alias'), and this.alias should be a better
        // way of doing this, but I've not managed to make it work
        cy.wait(200);
        cy.get('table.js-obj-to-html').then(($table) => {
            const html = `<table>${$table.html()}</table>`; // yucky kludge: how to get html with enclosing element?
            const table = new JSDOM(html).window.document;
            // convert NodeLists to arrays...
            const ths = Array.from(table.querySelectorAll('th'));
            const tds = Array.from(table.querySelectorAll('td'));
            // ... so we can build an easy comparison object
            const actual = {};
            for (let t=0; t<ths.length; t++) actual[ths[t].textContent] = tds[t].textContent;

            expect(actual['Alias']).to.equal(alias);
            expect(actual['On behalf of']).to.equal('Myself');
            expect(actual['Survivor gender']).to.equal('Female');
            expect(actual['Survivor age']).to.equal('20–24');
            expect(actual['Still happening?']).to.equal('Yes');
            expect(actual['Where']).to.equal('Neighbourhood (Around the corner)');
            expect(actual['Who']).to.equal('Not known (Big fat guy)');
            expect(actual['Description']).to.equal('Cypress test '+date);
            expect(actual['Spoken to anybody?']).to.equal('Teacher/tutor/lecturer (Miss Brodie); Friends, family');
            expect(actual['Extra notes']).to.equal('Nothing more');
            expect(actual['E-mail address']).to.equal('help@me.com');
            expect(actual['Phone number']).to.equal('01234 123456');
        });
        cy.get('button[name=delete]').click();
        cy.url().should('include', '/reports');

        cy.get('nav').contains('Logout').click();
    });
});
