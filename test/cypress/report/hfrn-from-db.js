/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Cypress front-end integration tests - HFRN report from from spec held in db.    C.Veness 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

/* eslint promise/catch-or-return: off, promise/always-return: off */
/* global Cypress, cy, expect */

import dateFormat from 'dateformat'; // Steven Levithan's dateFormat()
import { JSDOM }  from 'jsdom';      // JavaScript implementation of DOM and HTML standards

const org = 'hfrn-test'; // the test organisation for the ‘Humans For Rights Network‘ organisation
const proj = 'hfrn-en';  // this project is held in the database rather than the local file system


describe(`Submit ${org}/${proj} incident (from form spec in db)`, function () {
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

        cy.url().should('include', `/${org}/${proj}/2`);
        cy.get('#audio-consent-y + label').contains('Yes').click();
        cy.get('#name-author').type('Da boss');
        cy.get('#organisation').type('HFRN');
        cy.get('#name-statement').type('Alice');
        cy.get('#location-incident').type('Around the corner');
        cy.get('#on-behalf-of-y + label').contains('Yes - This incident happened to me').click();
        cy.get('#detailed-statement').type('Cypress test '+date);
        cy.get('#dpa-consent-y + label').contains('Yes').click();

        cy.contains('Submit and continue to Resources').click();

        cy.url().should('include', `/${org}/${proj}/whatnext`);
    });

    it('sees & deletes report in admin', function() {
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
        // TODO: cy.contains(alias).click();

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
            const expected = {
                'Alias':                                            alias,
                'Consent to record?':                               'Yes',
                'Name of person filling out form':                  'Da boss',
                'Organisation':                                     'HFRN',
                'Organisation reference':                           '—',
                'Contact details':                                  '—',
                'Name of person giving statement':                  'Alice',
                // TODO: 'What date did the incident occur?':                dateFormat('d mmm yyyy'),
                'Location':                                         'Around the corner',
                'Did this incident happen to you?':                 'Yes - This incident happened to me',
                'Description':                                      'Cypress test '+date,
                'Type of incident':                                 '—',
                'Who is the perpetrator?':                          '—',
                'Form of violence':                                 '—',
                'Reported?':                                        '—',
                'Medical attention required?':                      '—',
                'Did the incident involve an unaccompanied minor?': '—',
                'Consent to being contacted?':                      '—',
                'Consent to media testimony?':                      '—',
                'Consent to information?':                          'Yes',
            };
            expect(actual).to.deep.equal(expected);
        });
        cy.get('button[name=delete]').click();
        cy.url().should('include', '/reports');

        cy.get('nav').contains('Logout').click();
    });
});
