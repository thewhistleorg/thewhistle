/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Cypress front-end integration tests.                                            C.Veness 2018  */
/*                                                                                                */
/* GRN report backup and update to cover most permutations of error-free movement back and forth  */
/* through the reporting process.                                                                 */
/*                                                                                                */
/*                                       © 2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

/* eslint promise/catch-or-return: off, promise/always-return: off */
/* global Cypress, cy, expect */

import dateFormat from 'dateformat'; // Steven Levithan's dateFormat()
import { JSDOM }  from 'jsdom';      // JavaScript implementation of DOM and HTML standards

const org = 'grn-test';         // the test organisation for the live ‘grn‘ organisation
const proj = 'rape-is-a-crime'; // GRN's only project


describe(`Submit ${org}/${proj} incident report covering various enter-next-back-alter combinations`, function () {
    const report = 'http://report.thewhistle.local:3000';
    const admin = 'http://admin.thewhistle.local:3000';

    const date = dateFormat('d mmm yyyy HH:MM');
    let alias = null;

    // preserve session between each page
    beforeEach(function () {
        Cypress.Cookies.preserveOnce('koa:sess', 'koa:sess.sig');
    });


    it('tests home page', function() {
        cy.visit(`${report}/${org}/${proj}`);

        // go go go
        cy.contains('Get started').click();
        cy.url().should('include', `/${org}/${proj}/1`);
    });


    it('tests 1: used-before', function() {
        cy.visit(`${report}/${org}/${proj}/1`);

        // record generated alias
        cy.url().should('include', `/${org}/${proj}/1`);
        cy.get('output[name=used-before-generated-alias]').should('not.be.empty');
        cy.get('output[name=used-before-generated-alias]').then(($alias) => {
            alias = $alias.text(); // record alias to delete report later
            cy.log('alias', alias);
        });

        cy.contains('Submit and continue').click(); // next
        cy.url().should('include', `/${org}/${proj}/2`);
    });


    it('tests 2: on-behalf-of, survivor-gender/age', function() {
        cy.visit(`${report}/${org}/${proj}/2`);

        // check 'on-behalf-of-self' is default
        cy.get('#on-behalf-of-self').should('be.checked');
        cy.get('[data-on-behalf-of]').contains('If you are able, please provide your age and gender.');

        // select 'on-behalf-of-other' and check text is updated
        cy.get('label').contains('Someone else').click();
        cy.get('[data-on-behalf-of]').contains('If you are able, please enter your friend’s age and gender.');
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'on-behalf-of-other' is selected
        cy.get('#on-behalf-of-other').should('be.checked');

        // select 'survivor-gender-m'
        cy.get('label').contains('Male').click();
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'survivor-gender-m' is selected
        cy.get('#survivor-gender-m').should('be.checked');
        // select 'survivor-gender-f'
        cy.get('label').contains('Female').click();
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'survivor-gender-f' is selected
        cy.get('#survivor-gender-f').should('be.checked');
        // select 'survivor-gender-skip'
        cy.get('label[for=survivor-gender-skip]').contains('Skip').click();
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'survivor-gender-skip' is selected
        cy.get('#survivor-gender-skip').should('be.checked');

        // select 'survivor-age'
        cy.get('#survivor-age').select('20–24');
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'survivor-age' is 20–24
        cy.get('#survivor-age').should('have.value', '20–24');
        // select 'survivor-age-skip'
        cy.get('label[for=survivor-age-skip]').contains('Skip').click();
        // check 'survivor-age' is cleared
        cy.get('#survivor-age').should('have.value', '');
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'survivor-gender-skip' is selected
        cy.get('#survivor-gender-skip').should('be.checked');
        cy.get('#survivor-age').should('have.value', '');
        // and we're done
        cy.contains('Submit and continue').click(); // next
        cy.url().should('include', `/${org}/${proj}/3`);
    });


    it('tests 3: when / still-happening', function() {
        cy.visit(`${report}/${org}/${proj}/3`);

        // check parameterised question
        cy.get('h1').contains('To start, does your friend remember when this happened or when it began?');
        cy.get('#date\\.day').should('not.be.visible');
        cy.get('#when-within-options').should('not.be.visible');

        // select 'date'
        cy.get('label').contains('Yes, exactly when it happened').click();
        cy.get('#date\\.day').should('be.visible');
        // TODO: check day = dateFormat('d')?
        cy.get('#date\\.time').select('01:00'); // hopefully not in the future!
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'when-date' is selected and 'date.time' is 01:00
        cy.get('#when-date').should('be.checked');
        cy.get('#date\\.day').should('be.visible');
        cy.get('#date\\.time').should('have.value', '01:00');
        // select 'when-within' = last month
        cy.get('#when-within-options').should('not.be.visible');
        cy.get('label').contains('Yes, about when it happened').click();
        cy.get('#when-within-options').should('be.visible');
        cy.get('#date\\.day').should('not.be.visible');
        cy.get('#when-within-options').select('last month');
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'when-within' is selected and when-within-options is 'last month'
        cy.get('#when-within').should('be.checked');
        cy.get('#when-within-options').should('be.visible');
        cy.get('#when-within-options').should('have.value', 'last month');
        // select 'when-within' = do not remember
        cy.get('label').contains('I do not remember').click();
        cy.get('#when-within-options').should('not.be.visible');
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'when-dont-remember' is selected
        cy.get('#when-dont-remember').should('be.checked');
        // select 'when-skip'
        cy.get('label[for=when-skip]').contains('Skip').click();
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'when-skip' is selected
        cy.get('#when-skip').should('be.checked');
        // select 'still-happening-y'
        cy.get('label[for=still-happening-y').contains('Yes').click();
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'still-happening-y' is selected
        cy.get('#still-happening-y').should('be.checked');
        // select 'when-happening-n'
        cy.get('label').contains('No').click();
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'still-happening-n' is selected
        cy.get('#still-happening-n').should('be.checked');
        // select 'when-happening-skip'
        cy.get('label[for=still-happening-skip]').contains('Skip').click();
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'still-happening-skip' is selected and we're done
        cy.get('#still-happening-skip').should('be.checked');
        cy.contains('Submit and continue').click(); // next
        cy.url().should('include', `/${org}/${proj}/4`);
    });


    it('tests 4: where', function() {
        cy.visit(`${report}/${org}/${proj}/4`);

        // check parameterised question
        cy.get('h1').contains('If you are able, please select where it happened');

        cy.get('#where-details').should('not.be.visible');
        cy.get('select[name=where').select('Neighbourhood');
        cy.get('#where-details').should('be.visible');
        cy.get('#where-details').type('Around the corner');
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'where-at' is selected
        cy.get('#where').should('have.value', 'Neighbourhood');
        cy.get('#where-details').should('be.visible');
        cy.get('#where-details').should('have.value', 'Around the corner');
        cy.get('label').contains('Skip').click();
        cy.contains('Submit and continue').click(); // next
        cy.url().should('include', `/${org}/${proj}/5`);
    });


    it('tests 5: who', function() {
        cy.visit(`${report}/${org}/${proj}/5`);

        cy.get('#who-relationship').should('not.be.visible');
        // select 'who-y'
        cy.get('label').contains('Known').click();
        cy.get('#who-relationship').should('be.visible');
        cy.get('#who-relationship').type('My ex');
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'who-y' is selected
        cy.get('#who-y').should('be.checked');
        cy.get('#who-relationship').should('be.visible');
        cy.get('#who-relationship').contains('My ex');
        // select 'who-n'
        // TODO: FAILS!! cy.get('label').contains('No').click();
        cy.get('#who-n').click({ force: true }); // circumvent input#who-n not visible / being covered by label
        cy.get('#who-relationship').should('not.be.visible');
        cy.get('#who-description').should('be.visible');
        cy.get('#who-description').type('Big fat guy');
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'who-n' is selected
        cy.get('#who-n').should('be.checked');
        cy.get('#who-description').should('be.visible');
        cy.get('#who-description').contains('Big fat guy');
        // select 'who-skip' and we're done
        // TODO: FAILS!! cy.get('label').contains('Skip').click();
        cy.get('#who-skip').click({ force: true }); // circumvent input#who-skip not visible / being covered by label
        cy.get('#who-relationship').should('not.be.visible');
        cy.get('#who-description').should('not.be.visible');
        cy.contains('Submit and continue').click(); // next
        cy.url().should('include', `/${org}/${proj}/6`);
    });


    it('tests 6: description', function() {
        cy.visit(`${report}/${org}/${proj}/6`);

        // check parameterised question
        cy.get('p').contains('Try to describe as much of what you know happened as you can.');

        cy.get('#description').should('be.visible');
        cy.get('#description').type('Cypress test '+date);
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'description' is correctly filled in
        cy.get('#description').should('be.visible');
        cy.get('#description').contains('Cypress test '+date);
        // select 'description-skip'
        cy.get('label').contains('Skip').click();
        // TODO: broken functionality: no means to hide description when skip selected
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'description-skip' is selected
        // TODO: broken functionality: no means to hide description when skip selected
        // set description back so we can delete it later, and we're done
        cy.get('#description').click();
        cy.get('#description').contains('Cypress test '+date);
        cy.get('#description-skip').should('not.be.checked');

        // TODO: check file upload when available in cypress:
        // github.com/cypress-io/cypress/issues/170#issuecomment-366783764

        cy.contains('Submit and continue').click(); // next
        cy.url().should('include', `/${org}/${proj}/7`);
    });


    it('tests 7: action-taken', function() {
        cy.visit(`${report}/${org}/${proj}/7`);

        // check parameterised question
        cy.get('h1').contains('Have you or your friend spoken to anybody about what happened?');

        // select 'action-taken-teacher'
        cy.get('#action-taken-teacher-details').should('not.be.visible');
        cy.get('label').contains('Teacher/tutor/lecturer').click();
        cy.get('#action-taken-teacher-details').should('be.visible');
        cy.get('#action-taken-teacher-details').type('Miss Brodie');
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'action-taken-teacher' is selected
        cy.get('#action-taken-teacher').should('be.checked');
        cy.get('#action-taken-teacher-details').should('be.visible');
        // TODO: cypress cannot see content? cy.get('#action-taken-teacher-details').contains('Miss Brodie');
        cy.get('#action-taken-friends').should('not.be.checked');

        // select 'action-taken-skip' and we're done
        cy.get('label[for=action-taken-skip]').contains('Skip').click();
        cy.contains('Submit and continue').click(); // next
        cy.url().should('include', `/${org}/${proj}/8`);
    });


    it('tests 8: extra-notes', function() {
        cy.visit(`${report}/${org}/${proj}/8`);

        // TODO: broken functionality: no skip

        cy.get('input[name=contact-email]').type('help@me.com');
        cy.get('input[name=contact-phone]').type('01234 123456');

        cy.contains('Submit and continue to Resources').click(); // next
        cy.url().should('include', `/${org}/${proj}/whatnext`);
    });


    it('tests whatnext', function() {
        cy.visit(`${report}/${org}/${proj}/whatnext`);

        // TODO: broken functionality: no 'back' to previous page to revise extra-notes / contact-details

        cy.get('h1').contains('✔ We’ve received your report');
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
            const expected = {
                'Alias':              alias,
                'On behalf of':       'Someone else',
                'Survivor gender':    'Skip',
                'Survivor age':       'Skip',
                'Happened':           'Skip',
                'Still happening?':   'Skip',
                'Where':              'Skip',
                'Who':                'Skip',
                'Description':        'Cypress test '+date+',Skip', // TODO: note buggy behaviour! see 2f67a8
                'Spoken to anybody?': 'Skip',
                'E-mail address':     'help@me.com',
                'Phone number':       '01234 123456',
            };
            expect(actual).to.deep.equal(expected);
        });
        cy.get('button[name=delete]').click();
        cy.url().should('include', '/reports');

        cy.get('nav').contains('Logout').click();
    });
});
