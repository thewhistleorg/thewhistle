/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Cypress front-end integration tests - simple report submission.                 C.Veness 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

/* global Cypress, cy, expect */

import dateFormat from 'dateformat'; // Steven Levithan's dateFormat()
import { JSDOM }  from 'jsdom';      // JavaScript implementation of DOM and HTML standards

const org = 'grn-test';         // the test organisation for the live ‘grn‘ organisation
const proj = 'rape-is-a-crime'; // GRN's only project


describe.skip(`Submit ${org}/${proj} incident report simply visiting each page`, function () {
    const report = 'http://report.thewhistle.local:3000';
    const admin = 'http://admin.thewhistle.local:3000';

    const date = dateFormat('d mmm yyyy HH:MM');
    let alias = null;

    it('visits each page', function() {

        cy.visit(`${report}/${org}/${proj}`);
        cy.contains('Get started').click();

        cy.url().should('include', `/${org}/${proj}/1`); // alias
        cy.get('output[name=generated-alias]').should('not.be.empty');
        cy.get('output[name=generated-alias]').then(($alias) => {
            alias = $alias.text(); // record alias to delete report later
            cy.log('alias', alias);
        });
        cy.contains('Submit and continue').click();

        cy.url().should('include', `/${org}/${proj}/2`); // on-behalf-of
        cy.get('#on-behalf-of-myself + label').contains('Myself').click();
        cy.get('label').contains('Female').click();
        cy.get('select').select('20–24');
        cy.contains('Submit and continue').click();

        cy.url().should('include', `/${org}/${proj}/3`); // when / still-happening
        cy.get('#question-when label').contains('Yes, exactly when it happened').click();
        cy.get('#question-still-happening label').contains('Yes').click();
        cy.contains('Submit and continue').click();

        cy.url().should('include', `/${org}/${proj}/4`); // where
        // cy.get('#where label').contains('Location').click();
        cy.get('textarea[name=at-address]').type('University of Lagos');
        cy.contains('Submit and continue').click();

        cy.url().should('include', `/${org}/${proj}/5`); // who
        cy.get('input.who-relationship').should('not.be.visible');
        cy.get('textarea.who-description').should('not.be.visible');
        cy.get('#question-who label').contains('No').click();
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

        // wait a bit to be sure the alias assignment has worked through the event loop...
        // in principle, using .as('@alias'), cy.wait('@alias'), and this.alias should be a better
        // way of doing this, but I've not managed to make it work
        cy.wait(200);
        cy.get('table.js-obj-to-html').then(($table) => {
            const html = `<table>${$table.html()}</table>`; // yucky kludge: how to get html with enclosing element?
            const table = new JSDOM(html).window.document;
            const ths = table.querySelectorAll('th');
            const tds = table.querySelectorAll('td');
            expect(tds.length).to.equal(13);
            expect(ths[0].textContent).to.equal('Alias');
            expect(tds[0].textContent).to.equal(alias);
            expect(ths[1].textContent).to.equal('On behalf of');
            expect(tds[1].textContent).to.equal('Myself');
            expect(ths[2].textContent).to.equal('Survivor gender');
            expect(tds[2].textContent).to.equal('female');
            expect(ths[3].textContent).to.equal('Survivor age');
            expect(tds[3].textContent).to.equal('20–24');
            expect(ths[4].textContent).to.equal('Happened');
            expect(tds[4].textContent).to.equal(dateFormat('d mmm yyyy'));
            expect(ths[5].textContent).to.equal('Still happening?');
            expect(tds[5].textContent).to.equal('yes');
            expect(ths[6].textContent).to.equal('Where');
            expect(tds[6].textContent).to.equal('University of Lagos');
            expect(ths[7].textContent).to.equal('Who');
            expect(tds[7].textContent).to.equal('Not known: Big fat guy');
            expect(ths[8].textContent).to.equal('Description');
            expect(tds[8].textContent).to.equal('Cypress test '+date);
            expect(ths[9].textContent).to.equal('Spoken to anybody?');
            expect(tds[9].textContent).to.equal('Teacher/tutor/lecturer (Miss Brodie), Friends, family');
            expect(ths[10].textContent).to.equal('Extra notes');
            expect(tds[10].textContent).to.equal('Nothing more');
            expect(ths[11].textContent).to.equal('Contact e-mail');
            expect(tds[11].textContent).to.equal('help@me.com');
            expect(ths[12].textContent).to.equal('Contact phone');
            expect(tds[12].textContent).to.equal('01234 123456x');
        });
        cy.get('button[name=delete]').click();
        cy.url().should('include', '/reports');

        cy.get('nav').contains('Logout').click();
    });
});
