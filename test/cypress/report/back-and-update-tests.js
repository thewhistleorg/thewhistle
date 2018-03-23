/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Cypress front-end integration tests.                                            C.Veness 2018  */
/*                                                                                                */
/* Backup and update to cover most permutations of error-free movement back and forth through     */
/* the reporting process.                                                                         */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

/* global Cypress, cy, expect */

import dateFormat from 'dateformat'; // Steven Levithan's dateFormat()
import jsdom      from 'jsdom';      // JavaScript implementation of DOM and HTML standards

const org = 'grn';              // the test organisation for the live ‘test-grn‘ organisation
const proj = 'rape-is-a-crime'; // the test project for the live ‘sexual-assault‘ project


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
        cy.get('output[name=generated-alias]').should('not.be.empty');
        cy.get('output[name=generated-alias]').then(($alias) => {
            alias = $alias.text(); // record alias to delete report later
            cy.log('alias', alias);
        });

        cy.contains('Submit and continue').click(); // next
        cy.url().should('include', `/${org}/${proj}/2`);
    });


    it('tests 2: on-behalf-of, survivor-gender/age', function() {
        cy.visit(`${report}/${org}/${proj}/2`);

        // select 'on-behalf-of-myself'
        cy.get('label').contains('Myself').click();
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'on-behalf-of-myself' is selected
        cy.get('#on-behalf-of-myself').should('be.checked');
        // select 'someone-else'
        cy.get('label').contains('Someone else').click();
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'someone else' is selected
        cy.get('#on-behalf-of-someone-else').should('be.checked');

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
        cy.get('#within-options').should('not.be.visible');

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
        cy.get('#within-options').should('not.be.visible');
        cy.get('label').contains('Yes, about when it happened').click();
        cy.get('#within-options').should('be.visible');
        cy.get('#date\\.day').should('not.be.visible');
        cy.get('#within-options').select('last month');
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'when-within' is selected and within-options is 'last month'
        cy.get('#when-within').should('be.checked');
        cy.get('#within-options').should('be.visible');
        cy.get('#within-options').should('have.value', 'within last month');
        // select 'when-within' = do not remember
        cy.get('label').contains('I do not remember').click();
        cy.get('#within-options').should('not.be.visible');
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
        cy.get('h1').contains('Do you know anything about where this happened?');

        cy.get('#at-address').should('be.visible'); // TODO: TBC
        // select 'where-at'
        cy.get('label').contains('Yes').click();
        cy.get('#at-address').should('be.visible');
        cy.get('#at-address').type('Here and there');
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'where-at' is selected
        cy.get('#where-at').should('be.checked');
        cy.get('#at-address').should('be.visible');
        cy.get('#at-address').contains('Here and there');
        // select 'where-dont-know'
        // TODO: FAILS!! cy.get('label').contains('I don’t know').click();
        cy.get('#where-dont-know').click({ force: true }); // circumvent input#where-dont-know not visible / being covered by label
        cy.get('#at-address').should('not.be.visible');
        cy.contains('Submit and continue').click(); // next
        cy.get('#nav-prev').click();                // and back

        // check 'where-dont-know' is selected
        cy.get('#where-dont-know').should('be.checked');
        cy.get('#at-address').should('not.be.visible');
        // select 'where-skip' and we're done
        cy.get('label').contains('Skip').click();
        cy.contains('Submit and continue').click(); // next
        cy.url().should('include', `/${org}/${proj}/5`);
    });


    it('tests 5: who', function() {
        cy.visit(`${report}/${org}/${proj}/5`);

        cy.get('#who-relationship').should('not.be.visible');
        // select 'who-y'
        cy.get('label').contains('Yes').click();
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
        cy.get('p.hint-text').contains('Try to describe as much of what you know happened as you can.');

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

        cy.contains('Submit and continue').click(); // next
        cy.url().should('include', `/${org}/${proj}/whatnext`);
    });


    it('tests whatnext', function() {
        cy.visit(`${report}/${org}/${proj}/whatnext`);

        cy.get('h1').contains('✔ We’ve received your report');
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
            const table = new jsdom.JSDOM(html).window.document;
            const ths = table.querySelectorAll('th');
            const tds = table.querySelectorAll('td');
            expect(ths[0].textContent).to.equal('Alias');
            expect(tds[0].textContent).to.equal(alias);
            expect(ths[1].textContent).to.equal('On behalf of');
            expect(tds[1].textContent).to.equal('Someone else');
            expect(ths[2].textContent).to.equal('Survivor gender');
            expect(tds[2].textContent).to.equal('Skipped');
            expect(ths[3].textContent).to.equal('Survivor age');
            expect(tds[3].textContent).to.equal('Skipped');
            expect(ths[4].textContent).to.equal('Happened');
            expect(tds[4].textContent).to.equal('Skipped');
            expect(ths[5].textContent).to.equal('Still happening?');
            expect(tds[5].textContent).to.equal('Skipped');
            expect(ths[6].textContent).to.equal('Where');
            expect(tds[6].textContent).to.equal('Skipped');
            expect(ths[7].textContent).to.equal('Who');
            expect(tds[7].textContent).to.equal('Skipped');
            expect(ths[8].textContent).to.equal('Description');
            expect(tds[8].textContent).to.equal('Cypress test '+date+',skip'); // TODO: note buggy behaviour! see 2f67a8
            expect(ths[9].textContent).to.equal('Spoken to anybody?');
            expect(tds[9].textContent).to.equal('Skipped');
            expect(ths[10].textContent).to.equal('Extra notes');
            expect(tds[10].textContent).to.equal('—'); // TODO: broken functionality: no skip
        });
        cy.get('button[name=delete]').click();
        cy.url().should('include', '/reports');

        cy.get('nav').contains('Logout').click();
    });
});
